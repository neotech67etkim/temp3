# Work Order 관리 시스템

부서 → 과 → 팀 → 개인으로 이어지는 Work Order(업무지시) 체계를 통해, 공통 프로젝트의 업무를 조직 단위/개인 단위로 할당하고 카테고리별 진행률을 대시보드로 모니터링하는 사내 웹앱입니다.

## 핵심 기능

- **조직 관리**: 부서/과/팀/사용자 CRUD (관리자 전용)
- **Work Order 체계**: 프로젝트 아래 업무지시를 부서 → 과 → 팀 → 개인 순으로 계층적으로 하달(할당)
- **진행률 대시보드**: 카테고리별 진행률, 전체 상태 분포, 부서/과/팀 단위 진행 현황을 한눈에 확인
- **내 업무**: 로그인한 사용자에게 할당된 업무 확인 및 상태/진행률 업데이트

## 기술 스택

Next.js 15 (App Router, TypeScript) · Prisma + PostgreSQL · Auth.js(NextAuth v5, Credentials) · Tailwind CSS · Recharts

## 로컬 개발

```bash
npm install

# .env 생성 (.env.example 참고, DATABASE_URL/NEXTAUTH_SECRET 설정)
cp .env.example .env

# DB 스키마 적용 + 샘플 데이터 시드
npx prisma migrate dev
npx prisma db seed

npm run dev
```

기본 포트는 **4200** 입니다 (`npm run dev`, `npm run start` 모두 `-p 4200`).

시드 계정 (비밀번호 공통 `password123`):

| 이메일 | 역할 |
| --- | --- |
| admin@company.com | 관리자 |
| dept.head@company.com | 부서장 |
| div.head@company.com | 과장 |
| team.lead@company.com | 팀장 |
| member@company.com | 팀원 |

## 데이터/보안 관련 중요 사항

이 저장소(Git)에는 **애플리케이션 코드와 Prisma 스키마(구조)만** 포함됩니다. 실제 업무 데이터는 절대 Git에 커밋되지 않으며, 운영 환경의 PostgreSQL 데이터베이스에만 저장됩니다. 운영 배포 방법은 [`DEPLOYMENT.md`](./DEPLOYMENT.md)를 참고하세요.
