# Work Order 관리 시스템

부서 → 과 → 팀 → 개인으로 이어지는 Work Order(업무지시) 체계를 통해, 공통 프로젝트의 업무를 조직 단위/개인 단위로 할당하고 업무영역별 진행률을 대시보드로 모니터링하는 사내 웹앱입니다.

## 핵심 기능

- **조직 관리**: 부서/과/팀/사용자 CRUD (관리자 전용)
- **Work Order 체계**: 프로젝트 아래 업무지시를 부서 → 과 → 팀 → 개인 순으로 계층적으로 하달(할당)
- **진행률 대시보드**: 업무영역별 진행률, 전체 상태 분포, 부서/과/팀 단위 진행 현황을 한눈에 확인
- **내 업무**: 로그인한 사용자에게 할당된 업무 확인 및 상태/진행률 업데이트
- **간트차트**: 업무별 일정과 지연 여부 확인

## 기술 스택

Next.js (App Router, TypeScript) · Prisma + SQLite · Auth.js(NextAuth v5, Credentials) · Tailwind CSS · Recharts

## 로컬 개발

```bash
npm install

# .env 생성 (.env.example 참고 - 로컬 개발은 기본값 그대로 써도 됨)
cp .env.example .env

npm run dev
```

기본 포트는 **4200** 입니다 (`npm run dev`, `npm run start` 모두 `-p 4200`).

## 아키텍처

이 앱은 상시 켜진 서버 한 대(`npm run start`)가 모든 요청을 처리하고, 사내
PC들은 브라우저로 그 서버에 접속합니다. 데이터는 서버 로컬 디스크의 SQLite
파일들(`DATA_DIR` 환경변수가 가리키는 폴더 아래, 과별로 분리)에 저장됩니다.
운영 배포 방법은 [`DEPLOYMENT.md`](./DEPLOYMENT.md)를 참고하세요.

이 저장소(Git)에는 **애플리케이션 코드와 Prisma 스키마(구조)만** 포함됩니다. 실제 업무 데이터는 절대 Git에 커밋되지 않으며, 운영 서버의 `DATA_DIR`에만 저장됩니다.
