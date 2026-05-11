import { randomBytes } from 'node:crypto';

/**
 * e2e 테스트용 ENCRYPTION_MASTER_KEY 자동 생성.
 *
 * NestJS ConfigModule.forRoot()는 AppModule 클래스 정의 시점(import 단계)에
 * dotenv로 .env를 읽음 → 테스트 파일의 beforeAll보다 먼저 실행됨.
 * setupFiles 단계에서 process.env를 미리 채워야 ConfigService가 인식.
 *
 * 매 테스트 파일 신규 키 → 멱등성 + 시드 누설 X.
 * 사용자 .env에 값이 있더라도 테스트는 랜덤 키 사용(테스트 격리).
 */
process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('base64');

// NODE_ENV=test 명시 — ReconcilerModule이 KEPCO_CLIENT를 KepcoMockClient로 분기하기 위함
// (jest 디폴트도 test지만 의존하지 말고 명시).
process.env.NODE_ENV = 'test';
