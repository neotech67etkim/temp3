# 보안영역 배포 가이드

이 프로젝트는 **개발은 Git, 운영은 회사 보안영역 내부 서버**라는 원칙으로 배포합니다. Git 저장소에는 코드와 DB 스키마(구조)만 존재하고, 실제 업무 데이터는 보안영역 내부 PostgreSQL에만 저장되어 절대 외부(Git)로 나가지 않습니다.

## 원칙

1. Git 저장소 = 코드 + 스키마(`prisma/schema.prisma`, `prisma/migrations/`)만 보관
2. 보안영역 서버 = `git pull`로 코드만 받아 실행, DB는 보안영역 내부 인스턴스 사용
3. `.env`, 실제 데이터, 업로드 파일 등은 `.gitignore`에 의해 Git에 절대 포함되지 않음 (커밋 전 `git status`로 항상 확인)

## 최초 배포

```bash
# 1. 보안영역 서버에서 저장소 clone (최초 1회) 또는 pull
git clone <repo-url> work-order-app
cd work-order-app
git checkout main   # 배포 대상 브랜치

# 2. 의존성 설치
npm ci

# 3. 환경변수 설정 (.env.example을 참고해 보안영역 내부 값으로 채움)
cp .env.example .env
# DATABASE_URL: 보안영역 내부 PostgreSQL 접속 정보
# NEXTAUTH_SECRET: openssl rand -base64 32 로 생성한 값
# NEXTAUTH_URL: 보안영역 내부에서 접근하는 실제 URL (예: http://internal-host:4200)
# PORT=4200

# 4. 프로덕션 빌드
npm run build

# 5. DB 스키마 적용 (데이터는 건드리지 않고 구조만 마이그레이션)
npx prisma migrate deploy

# 6. (최초 1회, 선택) 초기 관리자 계정 등 샘플 데이터가 필요하면 시드 실행
npx prisma db seed

# 7. 서비스 시작 (포트 4200)
npm run start
```

## 재배포 (업데이트)

```bash
git pull origin main
npm ci
npm run build
npx prisma migrate deploy   # 스키마 변경이 있는 경우만 실제 적용됨
pm2 restart work-order-app  # 아래 pm2 사용 시
```

## 상시 실행 (pm2 예시)

```bash
npm install -g pm2

pm2 start npm --name work-order-app -- run start
pm2 save
pm2 startup   # 서버 재부팅 시 자동 시작 설정 안내 출력
```

`ecosystem.config.js` 를 별도로 만들고 싶다면:

```js
module.exports = {
  apps: [
    {
      name: "work-order-app",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: 4200,
      },
    },
  ],
};
```

## 데이터 격리 체크리스트

- [ ] 보안영역 서버의 `.env`는 Git에 커밋되지 않았는가 (`git status`로 확인)
- [ ] `DATABASE_URL`이 보안영역 내부 PostgreSQL을 가리키는가 (외부/개발 DB 아님)
- [ ] `npx prisma migrate deploy`만 사용하고, 데이터가 포함된 덤프 파일을 Git에 올리지 않았는가
- [ ] 업로드/첨부파일 저장 경로(추가 구현 시)가 `.gitignore`에 포함되어 있는가
