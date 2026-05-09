import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { SignerListService } from '../src/xrpl/signer-list.service';
import { XrplClientService } from '../src/xrpl/xrpl-client.service';

/**
 * 실 XRPL Testnet 통합 테스트.
 * - fundWallet 시퀀셜 ×4 (~20s, faucet rate-limit 회피)
 * - setSignerList submitAndWait (~5s)
 * - account_objects 조회 (~1s)
 * 예상 총 ~26-30s, 타임아웃 120s.
 */
describe('SignerListService (Testnet integration)', () => {
  let app: INestApplication;
  let signerListService: SignerListService;
  let xrplClient: XrplClientService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    signerListService = app.get(SignerListService);
    xrplClient = app.get(XrplClientService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('sets a 3-of-3 SignerList with quorum 2 and reflects on ledger', async () => {
    const client = xrplClient.getClient();

    // 시퀀셜 발급 (faucet rate-limit 회피)
    const ownerFunded = await client.fundWallet();
    const s1Funded = await client.fundWallet();
    const s2Funded = await client.fundWallet();
    const s3Funded = await client.fundWallet();

    const owner = ownerFunded.wallet;
    const signers = [s1Funded.wallet, s2Funded.wallet, s3Funded.wallet];

    const result = await signerListService.setSignerList({
      account: owner,
      signers: signers.map((s) => ({ account: s.classicAddress, weight: 1 })),
      quorum: 2,
    });

    expect(result.txHash).toMatch(/^[A-F0-9]{64}$/);
    expect(result.ledgerIndex).toBeGreaterThan(0);
    expect(result.validated).toBe(true);

    // 실제 ledger 상태 검증: account_objects로 SignerList 조회
    const objs = await client.request({
      command: 'account_objects',
      account: owner.classicAddress,
      type: 'signer_list',
    });

    const list = objs.result.account_objects[0] as {
      LedgerEntryType: string;
      SignerQuorum: number;
      SignerEntries: Array<{
        SignerEntry: { Account: string; SignerWeight: number };
      }>;
    };

    expect(list).toBeDefined();
    expect(list.LedgerEntryType).toBe('SignerList');
    expect(list.SignerQuorum).toBe(2);
    expect(list.SignerEntries).toHaveLength(3);

    const onChainAccounts = list.SignerEntries.map(
      (e) => e.SignerEntry.Account,
    ).sort();
    const expectedAccounts = signers.map((s) => s.classicAddress).sort();
    expect(onChainAccounts).toEqual(expectedAccounts);
  }, 120_000);
});
