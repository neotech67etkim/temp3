/**
 * NasStore(체크아웃/잠금) + org-sync(조직도 동기화) + db.setActiveDb(현재 활성 파일 전환)를
 * 하나로 묶은 상위 레벨 API. Electron 화면(또는 테스트)이 실제로 호출하게 될 진입점.
 */

import { NasStore, type LockInfo } from "./nas-store";
import { syncOrgInto } from "./org-sync";
import { openHeldDivision, closeHeldDivision, orgDb } from "./db";
export {
  getActiveContextInfo,
  type ActiveContextInfo,
  type ActiveHolder,
  type UnavailableDivision,
  isDivisionHeld,
  switchCurrentDivision,
  getHeldClient,
  setUnavailableDivisions,
  getUnavailableDivisions,
} from "./db";

export type OpenForEditResult =
  | { ok: true }
  | { ok: false; reason: "locked" | "stale"; lock: LockInfo };

export type OpenManyForEditResult = {
  ok: string[];
  failed: Array<{ key: string; reason: "locked" | "stale"; lock: LockInfo }>;
};

export class ActiveContext {
  constructor(
    private readonly store: NasStore,
    private readonly migrationsDir: string,
  ) {}

  /** 편집 모드로 특정 과를 연다: 잠금 → 조직도 동기화 → 보유 목록에 추가. */
  async openForEdit(
    key: string,
    holder: { name: string; email: string },
    opts: { force?: boolean } = {},
  ): Promise<OpenForEditResult> {
    const { result, localPath } = this.store.checkoutForEdit(key, holder, opts);
    if (!result.ok) {
      return { ok: false, reason: result.reason, lock: result.lock } as OpenForEditResult;
    }
    if (!localPath) throw new Error("체크아웃에 실패했습니다(localPath 없음).");

    await syncOrgInto(this.orgDbPath(), localPath, this.migrationsDir);
    openHeldDivision(localPath ? key : key, localPath, "edit", holder);
    return { ok: true };
  }

  /**
   * 여러 과를 한 번에 편집 모드로 연다(부서장의 "전체 편집 시작" 등). 잠긴
   * 과가 있어도 전체를 실패시키지 않고, 열 수 있는 과만 열고 나머지는
   * failed 목록으로 알려준다.
   */
  async openManyForEdit(
    keys: string[],
    holder: { name: string; email: string },
  ): Promise<OpenManyForEditResult> {
    const ok: string[] = [];
    const failed: OpenManyForEditResult["failed"] = [];
    for (const key of keys) {
      const { result, localPath } = this.store.checkoutForEdit(key, holder);
      if (!result.ok) {
        failed.push({ key, reason: result.reason, lock: result.lock });
        continue;
      }
      if (!localPath) continue;
      await syncOrgInto(this.orgDbPath(), localPath, this.migrationsDir);
      openHeldDivision(key, localPath, "edit", holder);
      ok.push(key);
    }
    return { ok, failed };
  }

  /** 과 하나만 저장하고 편집을 종료한다: 체크인 → 잠금 해제 → 보유 목록에서 제거. */
  saveAndClose(key: string): void {
    this.store.checkinAfterEdit(key);
    closeHeldDivision(key);
  }

  /** 과 하나만 저장하지 않고 편집을 취소한다. */
  discardAndClose(key: string): void {
    this.store.discardEdit(key);
    closeHeldDivision(key);
  }

  /** 지금 보유 중인 과를 전부 저장하고 종료한다("한 번에 모두 처리"). */
  saveAndCloseAll(keys: string[]): void {
    for (const key of keys) this.saveAndClose(key);
  }

  /** 지금 보유 중인 과를 전부 저장하지 않고 취소한다. */
  discardAndCloseAll(keys: string[]): void {
    for (const key of keys) this.discardAndClose(key);
  }

  /**
   * 모니터링(읽기 전용) 모드로 한 과를 연다: 잠금 없이 최신본을 로컬로 복사해서
   * 조직도까지 동기화한 뒤 보유 목록에 추가한다. 편집은 불가(호출자가 UI에서 막아야 함).
   */
  async openReadOnly(
    key: string,
    holder: { name: string; email: string },
  ): Promise<void> {
    const paths = this.store.checkoutReadOnly([key]);
    const localPath = paths[key];
    if (!localPath) {
      throw new Error(`아직 생성된 적 없는 과입니다: ${key}`);
    }
    await syncOrgInto(this.orgDbPath(), localPath, this.migrationsDir);
    openHeldDivision(key, localPath, "readonly", holder);
  }

  /** 현재 잠금 상태 조회(편집 시작 전 UI에 "○○님이 편집 중" 표시용). */
  getLockStatus(key: string) {
    return this.store.getLockStatus(key);
  }

  /** 모니터링 화면의 새로고침 루프가 "다시 불러올 필요가 있는지"만 싸게 확인할 때. */
  hasRemoteChanged(key: string, since: ReturnType<NasStore["getRemoteVersion"]>) {
    return this.store.hasChanged(key, since);
  }

  getRemoteVersion(key: string) {
    return this.store.getRemoteVersion(key);
  }

  private orgDbPath(): string {
    return this.store.remoteDbPath("org");
  }

  /** org.db 자체(조직 관리 화면)는 항상 orgDb를 통해 접근 - ActiveContext와 무관하게 고정. */
  static get org() {
    return orgDb;
  }
}
