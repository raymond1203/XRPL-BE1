# BlueSafe Backend 1

XRPL 트랜잭션 모듈 · 한전 정산 cron · 계약/PII PostgreSQL — KFIP 2026 출품 백엔드 일부.

## 사전 요구
- Node.js 22+
- Docker + Docker Compose

## 셋업

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 셋업
cp .env.example .env
# .env 편집 — 최소한 ENCRYPTION_MASTER_KEY와 XRPL_OPERATOR_SEED 채울 것
# 32바이트 base64 키 생성:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. 로컬 인프라(Postgres + Redis) 기동
docker compose up -d
```

## 개발

```bash
npm run start:dev      # watch 모드 부팅
npm test               # 단위 테스트 (외부 의존성 없음)
npm run test:e2e       # 통합 테스트 (Postgres + XRPL Testnet 필요)
npm run lint           # ESLint + Prettier
npm run build          # tsc + nest build
```

## 폴더 구조

```
src/
├── main.ts
├── app.module.ts
├── shared/                # KeyProvider, EncryptionService 등 cross-cutting
├── xrpl/                  # XRPL 트랜잭션 (XrplClient, Escrow, SignerList)
├── contracts/             # 계약/PII PostgreSQL 영속화
├── reconciler/            # 한전 API + 월별 정산 cron (W6)
└── queue/                 # BullMQ 큐 인프라 (TX 재시도)
```

## 스택

- NestJS 11 + TypeScript
- xrpl.js v3 — XRPL Testnet/Mainnet 트랜잭션
- TypeORM + PostgreSQL — 계약/PII 영속화
- AES-256-GCM — PII 컬럼 암호화
- BullMQ + Redis — TX 재시도 큐 (W5 후속)
- Joi — 부팅 시 환경변수 검증

## 네트워크

예선 단계: **XRPL Testnet 한정** (`wss://s.altnet.rippletest.net:51233`).
본선 진입 시 환경변수 `XRPL_NETWORK_URL`로 Mainnet 전환.
