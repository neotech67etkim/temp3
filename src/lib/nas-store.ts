/**
 * NAS 공유 폴더 위의 과별 SQLite 파일에 대한 체크아웃/잠금/체크인 모듈.
 *
 * 설계:
 * - 원본(authoritative) 파일은 NAS 공유 폴더(UNC 경로)에 있다: <NAS_ROOT>/<key>.db
 * - 편집하려면 잠금 파일(<NAS_ROOT>/locks/<key>.lock)을 먼저 원자적으로 생성해야 하고,
 *   이미 잠겨 있으면(그리고 오래되지 않았으면) 편집을 거부한다(덮어쓰기로 인한 데이터 유실 방지).
 * - 편집 중에는 로컬 임시 디스크에 복사한 파일(<LOCAL_ROOT>/<key>.db)을 사용해서 작업한다
 *   (네트워크 드라이브 위에서 SQLite를 직접 열면 파일 잠금이 불안정하기 때문).
 * - 저장(체크인)하면 로컬 파일을 NAS로 다시 복사(임시 이름 → rename으로 원자적 반영)하고 잠금을 해제한다.
 * - 모니터링(읽기 전용) 모드는 잠금과 무관하게 언제든 원본을 로컬 캐시로 복사해서 읽기만 한다.
 */

import fs from "node:fs";
import path from "node:path";

export type LockInfo = {
  holderName: string;
  holderEmail: string;
  pid: number;
  acquiredAt: string;
};

export type AcquireResult =
  | { ok: true }
  | { ok: false; reason: "locked"; lock: LockInfo }
  | { ok: false; reason: "stale"; lock: LockInfo };

export type NasStoreConfig = {
  /** NAS 공유 폴더(원본 저장 위치). UNC 경로 또는 마운트된 드라이브 경로. */
  nasRoot: string;
  /** 로컬 작업 디렉터리(체크아웃한 파일을 실제로 열어서 작업하는 곳). */
  localRoot: string;
  /** 이 시간(ms)이 지난 잠금은 "오래된 잠금"으로 간주해 강제 해제 후보가 된다. 기본 60분. */
  staleTimeoutMs?: number;
  /** 키(과)당 보관할 백업 개수. 초과분은 오래된 순으로 자동 삭제. 기본 200개. */
  maxBackupsPerKey?: number;
};

export type CheckinLogEntry = {
  key: string;
  holderName: string;
  holderEmail: string;
  checkedInAt: string;
  fileSizeBytes: number;
  backupPath: string | null;
};

export type RemoteVersion = {
  mtimeMs: number;
  size: number;
};

const DEFAULT_STALE_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_MAX_BACKUPS_PER_KEY = 200;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export class NasStore {
  private readonly nasRoot: string;
  private readonly localRoot: string;
  private readonly staleTimeoutMs: number;
  private readonly maxBackupsPerKey: number;

  constructor(config: NasStoreConfig) {
    this.nasRoot = config.nasRoot;
    this.localRoot = config.localRoot;
    this.staleTimeoutMs = config.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS;
    this.maxBackupsPerKey = config.maxBackupsPerKey ?? DEFAULT_MAX_BACKUPS_PER_KEY;
    ensureDir(this.nasRoot);
    ensureDir(path.join(this.nasRoot, "locks"));
    ensureDir(path.join(this.nasRoot, "backups"));
    ensureDir(path.join(this.nasRoot, "logs"));
    ensureDir(this.localRoot);
  }

  remoteDbPath(key: string): string {
    return path.join(this.nasRoot, `${key}.db`);
  }

  private remoteLockPath(key: string): string {
    return path.join(this.nasRoot, "locks", `${key}.lock`);
  }

  private backupDir(key: string): string {
    return path.join(this.nasRoot, "backups", key);
  }

  private checkinLogPath(): string {
    return path.join(this.nasRoot, "logs", "checkin-log.jsonl");
  }

  localDbPath(key: string): string {
    return path.join(this.localRoot, `${key}.db`);
  }

  /** 원본 파일의 현재 버전(수정시각+크기)을 조회한다. 모니터링 리프레시 루프에서
   *  "지난번에 본 것과 달라졌는지"만 싸게 확인할 때 쓴다(매번 파일 복사할 필요 없음). */
  getRemoteVersion(key: string): RemoteVersion | null {
    try {
      const stat = fs.statSync(this.remoteDbPath(key));
      return { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  /** 마지막으로 본 버전과 비교해 원본이 바뀌었는지 확인한다. */
  hasChanged(key: string, since: RemoteVersion | null): boolean {
    const current = this.getRemoteVersion(key);
    if (current === null && since === null) return false;
    if (current === null || since === null) return true;
    return current.mtimeMs !== since.mtimeMs || current.size !== since.size;
  }

  /** 이 키(과)에 대한 체크인 이력을 조회한다(감사 추적용). */
  getCheckinLog(key?: string): CheckinLogEntry[] {
    const logPath = this.checkinLogPath();
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
    const entries = lines.map((line) => JSON.parse(line) as CheckinLogEntry);
    return key ? entries.filter((e) => e.key === key) : entries;
  }

  private appendCheckinLog(entry: CheckinLogEntry): void {
    fs.appendFileSync(this.checkinLogPath(), `${JSON.stringify(entry)}\n`);
  }

  private pruneOldBackups(key: string): void {
    const dir = this.backupDir(key);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).sort(); // ISO 타임스탬프 파일명이라 정렬 = 시간순
    const excess = files.length - this.maxBackupsPerKey;
    for (let i = 0; i < excess; i++) {
      fs.rmSync(path.join(dir, files[i]), { force: true });
    }
  }

  private readLock(key: string): LockInfo | null {
    try {
      const raw = fs.readFileSync(this.remoteLockPath(key), "utf-8");
      return JSON.parse(raw) as LockInfo;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private isStale(lock: LockInfo): boolean {
    const age = Date.now() - new Date(lock.acquiredAt).getTime();
    return age > this.staleTimeoutMs;
  }

  /** 현재 잠금 상태를 조회한다(편집 시작 전 UI에 "○○님이 편집 중" 표시용). */
  getLockStatus(key: string): LockInfo | null {
    return this.readLock(key);
  }

  /** 이 잠금이 오래돼서(응답 없음) 강제 해제 후보인지 여부(UI에서 "편집불가" vs
   *  "강제로 이어받기"를 구분해 보여줄 때 씀). */
  isLockStale(lock: LockInfo): boolean {
    return this.isStale(lock);
  }

  /**
   * 편집 잠금을 원자적으로 획득한다.
   * - 잠금 파일이 없으면 즉시 생성하고 성공.
   * - 이미 잠겨 있고 오래되지 않았으면 실패(reason: "locked").
   * - 이미 잠겨 있지만 오래되었으면 실패하되 reason: "stale"로 알려줘서,
   *   호출자가 사용자에게 "강제 해제하시겠습니까?"를 물어본 뒤 force:true로 재시도할 수 있게 한다.
   */
  acquireLock(
    key: string,
    holder: { name: string; email: string },
    opts: { force?: boolean } = {},
  ): AcquireResult {
    const lockPath = this.remoteLockPath(key);
    const lock: LockInfo = {
      holderName: holder.name,
      holderEmail: holder.email,
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(lockPath, JSON.stringify(lock), { flag: "wx" });
      return { ok: true };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const existing = this.readLock(key);
      if (!existing) {
        // 방금 사이에 해제됐을 수 있음 - 한 번 더 시도
        return this.acquireLock(key, holder, opts);
      }

      const stale = this.isStale(existing);
      if (stale && opts.force) {
        fs.rmSync(lockPath, { force: true });
        return this.acquireLock(key, holder, { force: false });
      }

      return { ok: false, reason: stale ? "stale" : "locked", lock: existing };
    }
  }

  /** 잠금을 해제한다(정상 저장 후, 또는 편집 취소 시). */
  releaseLock(key: string): void {
    fs.rmSync(this.remoteLockPath(key), { force: true });
  }

  /**
   * 편집을 위해 체크아웃한다: 잠금을 획득하고, 원본 파일을 로컬로 복사한다.
   * 원본 파일이 아직 없으면(최초 실행) templateDbPath를 복사해 새로 만든다.
   */
  checkoutForEdit(
    key: string,
    holder: { name: string; email: string },
    opts: { force?: boolean; templateDbPath?: string } = {},
  ): { result: AcquireResult; localPath?: string } {
    const result = this.acquireLock(key, holder, opts);
    if (!result.ok) return { result };

    const remotePath = this.remoteDbPath(key);
    const localPath = this.localDbPath(key);
    ensureDir(path.dirname(localPath));

    if (fs.existsSync(remotePath)) {
      fs.copyFileSync(remotePath, localPath);
    } else if (opts.templateDbPath && fs.existsSync(opts.templateDbPath)) {
      fs.copyFileSync(opts.templateDbPath, localPath);
    } else {
      // 원본도 템플릿도 없으면 로컬에 새 파일을 만들 수 있게 빈 상태로 둔다.
      // (실제 스키마 적용은 Prisma db push/migrate가 별도로 수행)
      if (fs.existsSync(localPath)) fs.rmSync(localPath);
    }

    return { result, localPath };
  }

  /**
   * 편집 결과를 원본에 반영(체크인)하고 잠금을 해제한다.
   * - 덮어쓰기 전에 기존 원본을 백업 폴더에 타임스탬프로 보관한다(뒤죽박죽이 되었을 때 복구용).
   * - 임시 파일에 먼저 복사한 뒤 rename하여, 복사 도중 다른 프로세스가
   *   절반만 쓰인 파일을 읽지 않도록 한다.
   * - 누가/언제/어떤 크기로 체크인했는지 로그에 남긴다.
   */
  checkinAfterEdit(key: string): void {
    const localPath = this.localDbPath(key);
    const remotePath = this.remoteDbPath(key);

    if (!fs.existsSync(localPath)) {
      throw new Error(`로컬 작업 파일이 없습니다: ${localPath}`);
    }

    const lock = this.readLock(key);
    if (!lock) {
      throw new Error(`편집 잠금 없이는 체크인할 수 없습니다: ${key}`);
    }

    let backupPath: string | null = null;
    if (fs.existsSync(remotePath)) {
      const backupDir = this.backupDir(key);
      ensureDir(backupDir);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupPath = path.join(backupDir, `${timestamp}.db`);
      fs.copyFileSync(remotePath, backupPath);
      this.pruneOldBackups(key);
    }

    this.copyLocalToRemote(key);
    this.releaseLock(key);

    this.appendCheckinLog({
      key,
      holderName: lock.holderName,
      holderEmail: lock.holderEmail,
      checkedInAt: new Date().toISOString(),
      fileSizeBytes: fs.statSync(remotePath).size,
      backupPath,
    });
  }

  /** 로컬 작업 파일 → 원본으로 임시파일 경유 원자적 복사만 한다(잠금은 그대로 유지). */
  private copyLocalToRemote(key: string): void {
    const localPath = this.localDbPath(key);
    const remotePath = this.remoteDbPath(key);
    const tmpPath = `${remotePath}.tmp-${process.pid}-${Date.now()}`;
    fs.copyFileSync(localPath, tmpPath);
    fs.renameSync(tmpPath, remotePath);
  }

  /**
   * 편집 세션을 마치지 않은 상태에서도(잠금 유지한 채) 지금까지의 변경사항을
   * 원본에 즉시 반영한다. 상태 변경/진행률 입력 같은 개별 작업이 끝날 때마다
   * 이걸 호출해서, "저장하고 종료"를 누르기 전에 프로그램이 꺼지거나 문제가
   * 생겨도 마지막으로 즉시 저장된 시점 이후의 변경만 손실되게 한다. 매번
   * 백업 스냅샷/체크인 로그까지 남기면 너무 잦아지므로, 그건 최종
   * checkinAfterEdit에서만 한다.
   */
  syncToRemote(key: string): void {
    const localPath = this.localDbPath(key);
    if (!fs.existsSync(localPath)) {
      throw new Error(`로컬 작업 파일이 없습니다: ${localPath}`);
    }
    if (!this.readLock(key)) {
      throw new Error(`편집 잠금 없이는 저장할 수 없습니다: ${key}`);
    }
    this.copyLocalToRemote(key);
  }

  /** 편집을 취소한다: 로컬 변경을 버리고 잠금만 해제한다. */
  discardEdit(key: string): void {
    const localPath = this.localDbPath(key);
    fs.rmSync(localPath, { force: true });
    this.releaseLock(key);
  }

  /**
   * 모니터링(읽기 전용) 모드: 잠금과 무관하게 원본을 로컬 읽기 전용 캐시로 복사한다.
   * 여러 키(과)를 한 번에 새로고침할 때 사용한다(부서장 대시보드 등).
   */
  checkoutReadOnly(keys: string[]): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const key of keys) {
      const remotePath = this.remoteDbPath(key);
      if (!fs.existsSync(remotePath)) {
        out[key] = null;
        continue;
      }
      const readonlyPath = path.join(this.localRoot, "readonly", `${key}.db`);
      ensureDir(path.dirname(readonlyPath));
      fs.copyFileSync(remotePath, readonlyPath);
      out[key] = readonlyPath;
    }
    return out;
  }
}
