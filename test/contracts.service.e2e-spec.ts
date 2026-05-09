import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ContractStatus } from '../src/contracts/contract-status.enum';
import { ContractsService } from '../src/contracts/contracts.service';
import { XrplClientService } from '../src/xrpl/xrpl-client.service';

/**
 * 실 Postgres 통합 테스트.
 * 사전 요구: docker compose up -d (Postgres 컨테이너 기동)
 *
 * 핵심 검증:
 * - Contract 생성 시 PII는 ENCRYPTION_SERVICE로 암호화되어 저장됨
 * - raw SQL로 컬럼 직접 조회 시 평문 미포함 확인
 * - findById 시 ContractsService가 자동 복호화하여 평문 반환
 */
describe('ContractsService (Postgres integration)', () => {
  let app: INestApplication;
  let contractsService: ContractsService;
  let dataSource: DataSource;
  let xrplClient: XrplClientService;

  beforeAll(async () => {
    // ENCRYPTION_MASTER_KEY는 jest-e2e-setup.ts가 setupFiles에서 미리 주입.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    contractsService = app.get(ContractsService);
    dataSource = app.get(DataSource);
    xrplClient = app.get(XrplClientService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE contracts CASCADE');
  });

  it('persists Contract with PII as ciphertext at rest, decrypts on findById', async () => {
    const tenantPii = JSON.stringify({
      name: 'Sarah',
      passport: 'US123456',
      country: 'USA',
    });
    const landlordPii = JSON.stringify({
      name: '김임대',
      regNo: '781234-1******',
    });

    const created = await contractsService.create({
      tenantAddress: 'rTenantTestAccountXXXXXXXXXXXXXXX',
      landlordAddress: 'rLandlordTestAccountXXXXXXXXXXXXX',
      depositAmount: '100000000',
      stakeAmount: '20000000',
      startsAt: new Date('2026-06-01T00:00:00Z'),
      endsAt: new Date('2027-05-31T00:00:00Z'),
      finishAfter: new Date('2027-06-07T00:00:00Z'),
      cancelAfter: new Date('2027-06-30T00:00:00Z'),
      tenantPii,
      landlordPii,
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.status).toBe(ContractStatus.Pending);
    expect(created.tenantPii).toBe(tenantPii);
    expect(created.landlordPii).toBe(landlordPii);
    expect(created.contractAccountAddress).toBeNull();
    expect(created.depositEscrowSequence).toBeNull();

    // raw SQL로 PII 컬럼 직접 조회 → 평문 미포함 검증
    type CipherRow = { tenantPiiCipher: string; landlordPiiCipher: string };
    const raw: CipherRow[] = await dataSource.query(
      'SELECT "tenantPiiCipher", "landlordPiiCipher" FROM contracts WHERE id = $1',
      [created.id],
    );

    expect(raw).toHaveLength(1);
    expect(raw[0].tenantPiiCipher).not.toContain('Sarah');
    expect(raw[0].tenantPiiCipher).not.toContain('US123456');
    expect(raw[0].landlordPiiCipher).not.toContain('김임대');
    expect(raw[0].tenantPiiCipher.length).toBeGreaterThan(40); // base64 ciphertext

    // findById 통한 read 시 자동 복호화
    const fetched = await contractsService.findById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.tenantPii).toBe(tenantPii);
    expect(fetched!.landlordPii).toBe(landlordPii);
  });

  it('returns null for non-existent contract id', async () => {
    const result = await contractsService.findById(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });

  describe('lockTenantDeposit', () => {
    it('locks deposit + stake escrows + sets 3-of-3 SignerList + persists Contract row', async () => {
      const client = xrplClient.getClient();

      // 4 wallets 시퀀셜 발급 (faucet rate-limit 회피)
      const contractFunded = await client.fundWallet();
      const tenantFunded = await client.fundWallet();
      const landlordFunded = await client.fundWallet();
      const operatorFunded = await client.fundWallet();
      const contract = contractFunded.wallet;
      const tenant = tenantFunded.wallet;
      const landlord = landlordFunded.wallet;
      const operator = operatorFunded.wallet;

      const now = Date.now();
      const startsAt = new Date(now);
      const endsAt = new Date(now + 365 * 24 * 3600 * 1000);
      const finishAfter = new Date(now + 372 * 24 * 3600 * 1000);
      const cancelAfter = new Date(now + 395 * 24 * 3600 * 1000);

      const tenantPii = JSON.stringify({
        name: 'Sarah Smith',
        passport: 'US-PA-123456',
      });
      const landlordPii = JSON.stringify({ name: '김임대' });

      const result = await contractsService.lockTenantDeposit({
        contractWallet: contract,
        tenantAddress: tenant.classicAddress,
        landlordAddress: landlord.classicAddress,
        operatorAddress: operator.classicAddress,
        depositAmount: '50000000', // 50 XRP
        stakeAmount: '10000000', // 10 XRP
        startsAt,
        endsAt,
        finishAfter,
        cancelAfter,
        tenantPii,
        landlordPii,
      });

      // 반환 DTO 검증
      expect(result.status).toBe(ContractStatus.Locked);
      expect(result.contractAccountAddress).toBe(contract.classicAddress);
      expect(result.depositEscrowSequence).toBeGreaterThan(0);
      expect(result.depositEscrowTxHash).toMatch(/^[A-F0-9]{64}$/);
      expect(result.stakeEscrowSequence).toBeGreaterThan(0);
      expect(result.stakeEscrowTxHash).toMatch(/^[A-F0-9]{64}$/);
      expect(result.signerListTxHash).toMatch(/^[A-F0-9]{64}$/);
      expect(result.tenantPii).toBe(tenantPii);
      expect(result.landlordPii).toBe(landlordPii);

      // 실제 ledger 검증: account_objects로 SignerList 조회
      const objs = await client.request({
        command: 'account_objects',
        account: contract.classicAddress,
        type: 'signer_list',
      });
      const signerList = objs.result.account_objects[0] as {
        LedgerEntryType: string;
        SignerQuorum: number;
        SignerEntries: Array<{
          SignerEntry: { Account: string; SignerWeight: number };
        }>;
      };
      expect(signerList.LedgerEntryType).toBe('SignerList');
      expect(signerList.SignerQuorum).toBe(2);
      expect(signerList.SignerEntries).toHaveLength(3);

      const onChainAccounts = signerList.SignerEntries.map(
        (e) => e.SignerEntry.Account,
      ).sort();
      const expectedAccounts = [
        tenant.classicAddress,
        landlord.classicAddress,
        operator.classicAddress,
      ].sort();
      expect(onChainAccounts).toEqual(expectedAccounts);

      // DB 영속화 검증: findById로 round-trip
      const fetched = await contractsService.findById(result.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.status).toBe(ContractStatus.Locked);
      expect(fetched!.depositEscrowTxHash).toBe(result.depositEscrowTxHash);
    }, 120_000);
  });
});
