import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EscrowService } from '../src/xrpl/escrow.service';
import { XrplClientService } from '../src/xrpl/xrpl-client.service';

/**
 * 실 XRPL Testnet 통합 테스트.
 * - fundWallet faucet 호출 ~5s × 2
 * - submitAndWait ~5s
 * 예상 총 시간 ~15-20s, 타임아웃은 여유 있게 90s.
 *
 * 실행: npm run test:e2e
 */
describe('EscrowService (Testnet integration)', () => {
  let app: INestApplication;
  let escrowService: EscrowService;
  let xrplClient: XrplClientService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    escrowService = app.get(EscrowService);
    xrplClient = app.get(XrplClientService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('creates a real Escrow on Testnet via fundWallet-derived wallets', async () => {
    const client = xrplClient.getClient();
    const { wallet: sender } = await client.fundWallet();
    const { wallet: receiver } = await client.fundWallet();

    const finishAfter = new Date(Date.now() + 60_000); // 1분 후 해제 가능

    const result = await escrowService.createEscrow({
      account: sender,
      destination: receiver.classicAddress,
      amount: '10000000', // 10 XRP (drops)
      finishAfter,
    });

    expect(result.txHash).toMatch(/^[A-F0-9]{64}$/);
    expect(result.escrowSequence).toBeGreaterThan(0);
    expect(result.ledgerIndex).toBeGreaterThan(0);
    expect(result.validated).toBe(true);
  }, 90_000);
});
