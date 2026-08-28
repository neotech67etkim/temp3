# 배포 가이드 (상시 웹서버)

이 앱은 회사 내부망(LAN)에 상시 켜져 있는 PC/서버 한 대에서 Next.js 서버로
실행되고, 사내 PC들은 브라우저로 그 서버에 접속해서 사용합니다. 데이터는
서버 로컬 디스크의 SQLite 파일들(과별로 분리)에 저장됩니다.

## 아키텍처 요약

- **코드/화면/업무 로직**: Next.js 앱(`src/`). 상시 서버 하나에서
  `next start`로 실행되고, 모든 사용자가 브라우저로 같은 서버에 접속합니다.
- **데이터 저장**: SQLite 파일들, 전부 `DATA_DIR` 환경변수가 가리키는 폴더
  아래에 있습니다.
  - `org.db` — 조직도/계정/업무영역/프로젝트 원본 (항상 하나)
  - `<과이름>.db` — 각 과가 소유한 Work Order/로그 (과 단위로 분리)
  - `__부서공통__.db` — 특정 과에 속하지 않는 부서 전체 업무
  - 이 파일들은 서버가 계속 열어두고 직접 읽고 쓰므로, 예전(각 PC에
    설치된 Electron 앱 + NAS 공유 폴더) 버전에 있던 "편집 시작/저장/종료"
    잠금이나 체크아웃 절차가 필요 없습니다 - 서버 하나가 모든 요청을
    순서대로 처리하기 때문입니다.
- **Copilot 연동용 export**: 저장할 때마다 `copilot-export/<과>.md`(현재 업무
  현황)와 `copilot-export/<과>-변경이력.md`(전체 변경 이력)가 함께 갱신됩니다.
  조직 관리(/org)에서 부서/과/팀/사용자를 추가·삭제할 때마다
  `copilot-export/조직도.md`도 함께 갱신됩니다.

## 최초 설치 절차

### 1. 서버로 쓸 PC 준비

24시간 켜둘 수 있는 PC/서버 한 대를 정합니다. Node.js(LTS 버전)를 설치하세요.

### 2. 코드 받기 + 빌드

```bash
git clone <이 저장소> workorder
cd workorder
npm ci
```

### 3. 환경변수 설정

`.env.example`을 참고해 `.env`를 만듭니다.

```bash
cp .env.example .env
```

최소한 아래 값을 채워야 합니다:

```
DATA_DIR="C:\workorder-data"           # 이 서버 로컬 디스크의 데이터 폴더(원하는 경로로)
NEXTAUTH_SECRET="..."                   # openssl rand -base64 32 로 생성
NEXTAUTH_URL="http://<이 서버의 사내 IP>:4200"
PORT=4200
```

`DATA_DIR`은 서버가 꺼졌다 켜져도 그대로 있어야 하는 폴더입니다(외장 드라이브도
가능하지만, 서버가 항상 그 드라이브에 접근 가능해야 합니다).

### 4. 빌드 + 최초 실행

```bash
npm run build
npm run start
```

기본 포트는 **4200**입니다. 최초 실행 시 `org.db`가 비어 있으므로, 관리자
권한이 있는 누군가가 조직도/계정을 만들어야 합니다(`/org` 화면에서 직접
입력하거나, `scripts/init-real-data.ts`를 참고해 초기 데이터 스크립트를
작성해 실행).

### 5. 사내 PC에서 접속

각 PC에서 브라우저로 `http://<서버 IP>:4200`에 접속하면 로그인 화면이
나옵니다. 즐겨찾기에 등록해두면 편합니다.

## 상시 실행 유지 (서버가 꺼지거나 재부팅돼도 자동으로 다시 뜨게)

`npm run start`를 터미널에 띄워둔 채로 두면 터미널을 닫는 순간 서버도
꺼집니다. 아래 중 하나로 백그라운드 서비스처럼 등록해두세요.

### Windows: 작업 스케줄러 + pm2 (권장)

```bash
npm install -g pm2
pm2 start npm --name workorder -- run start
pm2 save
```

그다음 Windows 작업 스케줄러에 "로그온 시 `pm2 resurrect` 실행" 작업을
등록하면, PC가 재부팅돼도 서버가 자동으로 다시 켜집니다.

### Linux: systemd

```ini
# /etc/systemd/system/workorder.service
[Unit]
Description=WorkOrder
After=network.target

[Service]
WorkingDirectory=/opt/workorder
ExecStart=/usr/bin/npm run start
Restart=always
EnvironmentFile=/opt/workorder/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now workorder
```

## 업데이트(재배포)

새 버전을 반영하려면 서버 PC에서:

```bash
git pull
npm ci
npm run build
pm2 restart workorder   # 또는: sudo systemctl restart workorder
```

몇 초 정도 서버가 재시작되는 동안만 접속이 끊기고, 그 뒤로는 바로 새
버전으로 사용할 수 있습니다. 데이터(`DATA_DIR`)는 배포와 무관하게 그대로
보존됩니다.

## 백업

`DATA_DIR` 아래 `*.db` 파일들이 실제 데이터 전부입니다. 정기적으로(예:
매일 새벽) 이 폴더를 통째로 다른 디스크나 외장 드라이브로 복사해두는
백업 절차를 별도로 마련하는 걸 권장합니다(Windows 작업 스케줄러 + 간단한
복사 스크립트, 또는 `robocopy` 등).

## 데이터 격리 체크리스트

- [ ] Git 저장소에는 스키마(`prisma/schema.prisma`, `prisma/migrations/`)만 있고,
      실제 업무 데이터(`org.db`, 과별 `.db` 파일)는 전혀 포함되지 않았는가
- [ ] `.dev-data/`(로컬 개발용 폴더)가 `.gitignore`에 포함되어 실수로
      커밋되지 않았는가
- [ ] `DATA_DIR`에 대한 접근 권한이 서버 운영자에게만 부여되어 있는가

## 참고: 기존 방식과 달라진 점

이전 버전은 각 PC에 Electron 데스크톱 앱을 설치하고, NAS 공유 폴더의
SQLite 파일을 여러 PC가 직접 체크아웃/잠금 걸어가며 편집하는 구조였습니다
(상시 서버를 구하기 어려웠기 때문). 이제 24시간 켜둘 수 있는 서버가
생겨서, 표준적인 "서버 하나 + 브라우저로 접속" 방식으로 전환했습니다.
그 결과:

- 각 PC에 설치 파일을 배포/업데이트하던 절차(Electron, `deploy.bat`,
  NAS `releases/` 폴더 자동 업데이트 확인)가 전부 없어졌습니다 - 서버만
  업데이트하면 모든 사용자가 즉시 새 버전을 씁니다.
- "편집 시작/저장하고 종료/취소", 동시 편집 잠금, 대기자 알림 같은
  화면들이 없어졌습니다 - 서버 하나가 모든 쓰기를 순서대로 처리하므로
  더 이상 필요하지 않습니다. 이제 권한이 있는 사람은 바로 수정할 수
  있습니다(일반적인 웹앱과 동일).
