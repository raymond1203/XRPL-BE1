import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import type { Repository } from 'typeorm';
import type { Wallet } from 'xrpl';
import { ENCRYPTION_SERVICE } from '../shared/crypto/encryption.interface';
import { EscrowService } from '../xrpl/escrow.service';
import { SignerListService } from '../xrpl/signer-list.service';
import { ContractStatus } from './contract-status.enum';
import { Contract } from './contract.entity';
import { ContractsService } from './contracts.service';

describe('ContractsService.lockTenantDeposit (orchestration unit)', () => {
  let service: ContractsService;
  let repo: jest.Mocked<
    Pick<Repository<Contract>, 'create' | 'save' | 'update' | 'findOneBy'>
  >;
  let escrow: jest.Mocked<Pick<EscrowService, 'createEscrow'>>;
  let signerList: jest.Mocked<Pick<SignerListService, 'setSignerList'>>;
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };

  const CONTRACT_ID = 'contract-uuid-1';
  const CONTRACT_ADDR = 'rContractXXXXXXXXXXXXXXXXXXXXXXXXX';
  const TENANT_ADDR = 'rTenantXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const LANDLORD_ADDR = 'rLandlordXXXXXXXXXXXXXXXXXXXXXXXXX';
  const OPERATOR_ADDR = 'rOperatorXXXXXXXXXXXXXXXXXXXXXXXXX';

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      findOneBy: jest.fn(),
    };
    escrow = { createEscrow: jest.fn() };
    signerList = { setSignerList: jest.fn() };
    // identity-like encryption — round-trip이 가능하도록
    encryption = {
      encrypt: jest.fn((p: string) => `enc(${p})`),
      decrypt: jest.fn((c: string) =>
        c.replace(/^enc\(/, '').replace(/\)$/, ''),
      ),
    };

    const moduleFixture = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: getRepositoryToken(Contract), useValue: repo },
        { provide: ENCRYPTION_SERVICE, useValue: encryption },
        { provide: EscrowService, useValue: escrow },
        { provide: SignerListService, useValue: signerList },
      ],
    }).compile();

    service = moduleFixture.get(ContractsService);
  });

  it('orchestrates 3 XRPL transactions in order, persists final state with status=Locked', async () => {
    // ---- 입력 ----
    const contractWallet = {
      classicAddress: CONTRACT_ADDR,
      seed: 'sEdMockContractSeed1234567890',
    } as unknown as Wallet;
    const finishAfter = new Date('2027-06-07T00:00:00Z');
    const cancelAfter = new Date('2027-06-30T00:00:00Z');
    const input = {
      contractWallet,
      tenantAddress: TENANT_ADDR,
      landlordAddress: LANDLORD_ADDR,
      operatorAddress: OPERATOR_ADDR,
      depositAmount: '50000000',
      stakeAmount: '10000000',
      startsAt: new Date('2026-06-01T00:00:00Z'),
      endsAt: new Date('2027-05-31T00:00:00Z'),
      finishAfter,
      cancelAfter,
      tenantPii: 'tenant-secret',
      landlordPii: 'landlord-secret',
    };

    // ---- mock 응답 ----
    const pendingRow: Contract = {
      id: CONTRACT_ID,
      tenantAddress: TENANT_ADDR,
      landlordAddress: LANDLORD_ADDR,
      contractAccountAddress: null,
      contractAccountSeedCipher: null,
      depositAmount: '50000000',
      stakeAmount: '10000000',
      depositEscrowSequence: null,
      depositEscrowTxHash: null,
      stakeEscrowSequence: null,
      stakeEscrowTxHash: null,
      signerListTxHash: null,
      status: ContractStatus.Pending,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      finishAfter,
      cancelAfter,
      tenantPiiCipher: 'enc(tenant-secret)',
      landlordPiiCipher: 'enc(landlord-secret)',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const lockedRow: Contract = {
      ...pendingRow,
      contractAccountAddress: CONTRACT_ADDR,
      contractAccountSeedCipher: 'enc(sEdMockContractSeed1234567890)',
      depositEscrowSequence: 11,
      depositEscrowTxHash: 'A'.repeat(64),
      stakeEscrowSequence: 12,
      stakeEscrowTxHash: 'B'.repeat(64),
      signerListTxHash: 'C'.repeat(64),
      status: ContractStatus.Locked,
    };

    repo.create.mockReturnValue(pendingRow);
    repo.save.mockResolvedValue(pendingRow);
    repo.update.mockResolvedValue({
      affected: 1,
      generatedMaps: [],
      raw: {},
    });
    repo.findOneBy.mockResolvedValue(lockedRow);
    escrow.createEscrow
      .mockResolvedValueOnce({
        txHash: 'A'.repeat(64),
        escrowSequence: 11,
        ledgerIndex: 100,
        validated: true,
      })
      .mockResolvedValueOnce({
        txHash: 'B'.repeat(64),
        escrowSequence: 12,
        ledgerIndex: 101,
        validated: true,
      });
    signerList.setSignerList.mockResolvedValue({
      txHash: 'C'.repeat(64),
      ledgerIndex: 102,
      validated: true,
    });

    // ---- 실행 ----
    const result = await service.lockTenantDeposit(input);

    // ---- 검증: 호출 순서 ----
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(escrow.createEscrow).toHaveBeenCalledTimes(2);
    expect(signerList.setSignerList).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenCalledTimes(1);

    // ---- 검증: deposit escrow params ----
    const [depositArg] = escrow.createEscrow.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(depositArg.account).toBe(contractWallet);
    expect(depositArg.destination).toBe(TENANT_ADDR);
    expect(depositArg.amount).toBe('50000000');
    expect(depositArg.finishAfter).toBe(finishAfter);

    // ---- 검증: stake escrow params ----
    const [stakeArg] = escrow.createEscrow.mock.calls[1] as [
      Record<string, unknown>,
    ];
    expect(stakeArg.account).toBe(contractWallet);
    expect(stakeArg.destination).toBe(LANDLORD_ADDR);
    expect(stakeArg.amount).toBe('10000000');

    // ---- 검증: SignerListSet params (3-of-3 quorum 2) ----
    const [signerArg] = signerList.setSignerList.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(signerArg.account).toBe(contractWallet);
    expect(signerArg.quorum).toBe(2);
    expect(signerArg.signers).toEqual([
      { account: TENANT_ADDR, weight: 1 },
      { account: LANDLORD_ADDR, weight: 1 },
      { account: OPERATOR_ADDR, weight: 1 },
    ]);

    // ---- 검증: repo.update 파라미터 (seed 암호문 포함) ----
    expect(repo.update).toHaveBeenCalledWith(CONTRACT_ID, {
      contractAccountAddress: CONTRACT_ADDR,
      contractAccountSeedCipher: 'enc(sEdMockContractSeed1234567890)',
      depositEscrowSequence: 11,
      depositEscrowTxHash: 'A'.repeat(64),
      stakeEscrowSequence: 12,
      stakeEscrowTxHash: 'B'.repeat(64),
      signerListTxHash: 'C'.repeat(64),
      status: ContractStatus.Locked,
    });

    // ---- 검증: 반환 DTO ----
    expect(result.id).toBe(CONTRACT_ID);
    expect(result.status).toBe(ContractStatus.Locked);
    expect(result.contractAccountAddress).toBe(CONTRACT_ADDR);
    expect(result.depositEscrowTxHash).toBe('A'.repeat(64));
    expect(result.tenantPii).toBe('tenant-secret'); // decrypt 통과
  });

  it('propagates error if stake escrow fails — Contract row stays Pending (no rollback)', async () => {
    const contractWallet = {
      classicAddress: CONTRACT_ADDR,
      seed: 'sEdMockContractSeed1234567890',
    } as unknown as Wallet;
    const finishAfter = new Date('2027-06-07T00:00:00Z');
    const cancelAfter = new Date('2027-06-30T00:00:00Z');

    const pendingRow = {
      id: CONTRACT_ID,
      tenantPiiCipher: 'enc(t)',
      landlordPiiCipher: 'enc(l)',
    } as unknown as Contract;
    repo.create.mockReturnValue(pendingRow);
    repo.save.mockResolvedValue(pendingRow);

    escrow.createEscrow
      .mockResolvedValueOnce({
        txHash: 'A'.repeat(64),
        escrowSequence: 11,
        ledgerIndex: 100,
        validated: true,
      })
      .mockRejectedValueOnce(
        new Error('EscrowCreate failed: tecINSUF_RESERVE'),
      );

    await expect(
      service.lockTenantDeposit({
        contractWallet,
        tenantAddress: TENANT_ADDR,
        landlordAddress: LANDLORD_ADDR,
        operatorAddress: OPERATOR_ADDR,
        depositAmount: '50000000',
        stakeAmount: '10000000',
        startsAt: new Date('2026-06-01'),
        endsAt: new Date('2027-05-31'),
        finishAfter,
        cancelAfter,
        tenantPii: 't',
        landlordPii: 'l',
      }),
    ).rejects.toThrow(/tecINSUF_RESERVE/);

    // SignerListSet/update 호출 안 됨
    expect(signerList.setSignerList).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });
});
