import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Wallet } from 'xrpl';
import {
  ENCRYPTION_SERVICE,
  type EncryptionService,
} from '../shared/crypto/encryption.interface';
import { EscrowService } from '../xrpl/escrow.service';
import { SignerListService } from '../xrpl/signer-list.service';
import { ContractStatus } from './contract-status.enum';
import { Contract } from './contract.entity';

export interface CreateContractInput {
  tenantAddress: string;
  landlordAddress: string;
  depositAmount: string; // XRP drops
  stakeAmount: string;
  startsAt: Date;
  endsAt: Date;
  finishAfter: Date;
  cancelAfter: Date;
  tenantPii: string; // 평문 — 암호화는 본 서비스가 처리
  landlordPii: string;
  /** 월간 리포트 이메일 발송 대상. 부재 시 발송 skip. */
  tenantEmail?: string | null;
}

export interface LockTenantDepositInput extends CreateContractInput {
  /** 3건 트랜잭션 모두 서명할 contract account */
  contractWallet: Wallet;
  /** SignerList에 등록할 BlueSafe 운영 지갑 주소 */
  operatorAddress: string;
}

export interface ContractDto {
  id: string;
  tenantAddress: string;
  landlordAddress: string;
  contractAccountAddress: string | null;
  /**
   * INTERNAL ONLY — 절대 HTTP 응답에 포함하지 말 것.
   * 월별 정산 cron이 contract account에서 Payment를 서명하기 위한 seed.
   * 본선에서 KMS 전환 시 EncryptionService 인터페이스 교체로 처리.
   */
  contractAccountSeed: string | null;
  depositAmount: string;
  stakeAmount: string;
  depositEscrowSequence: number | null;
  depositEscrowTxHash: string | null;
  stakeEscrowSequence: number | null;
  stakeEscrowTxHash: string | null;
  signerListTxHash: string | null;
  status: ContractStatus;
  startsAt: Date;
  endsAt: Date;
  finishAfter: Date;
  cancelAfter: Date;
  tenantPii: string; // 복호화된 평문
  landlordPii: string;
  tenantEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectRepository(Contract) private readonly repo: Repository<Contract>,
    @Inject(ENCRYPTION_SERVICE) private readonly encryption: EncryptionService,
    private readonly escrowService: EscrowService,
    private readonly signerListService: SignerListService,
  ) {}

  async create(input: CreateContractInput): Promise<ContractDto> {
    const entity = this.repo.create({
      tenantAddress: input.tenantAddress,
      landlordAddress: input.landlordAddress,
      depositAmount: input.depositAmount,
      stakeAmount: input.stakeAmount,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      finishAfter: input.finishAfter,
      cancelAfter: input.cancelAfter,
      tenantPiiCipher: this.encryption.encrypt(input.tenantPii),
      landlordPiiCipher: this.encryption.encrypt(input.landlordPii),
      tenantEmail: input.tenantEmail ?? null,
      status: ContractStatus.Pending,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async findById(id: string): Promise<ContractDto | null> {
    const found = await this.repo.findOneBy({ id });
    return found ? this.toDto(found) : null;
  }

  /** 월별 정산 cron이 사용하는 iteration 진입점 */
  async findAllLocked(): Promise<ContractDto[]> {
    const rows = await this.repo.find({
      where: { status: ContractStatus.Locked },
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * 한 호출로:
   *   1) Contract row 생성 (status=Pending)
   *   2) 보증금 EscrowCreate (contract → tenant)
   *   3) 임대인 Stake EscrowCreate (contract → landlord)
   *   4) SignerListSet on contract account (3-of-3, quorum 2)
   *   5) Contract row 업데이트 (트랜잭션 결과 + status=Locked)
   *
   * 부분 실패 시 throw — Contract row는 Pending 상태로 남음. 보상/재시도는
   * 후속 BullMQ 워커 도입 후 처리.
   */
  async lockTenantDeposit(input: LockTenantDepositInput): Promise<ContractDto> {
    // 1. Pending 상태로 row 생성
    const contract = await this.create({
      tenantAddress: input.tenantAddress,
      landlordAddress: input.landlordAddress,
      depositAmount: input.depositAmount,
      stakeAmount: input.stakeAmount,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      finishAfter: input.finishAfter,
      cancelAfter: input.cancelAfter,
      tenantPii: input.tenantPii,
      landlordPii: input.landlordPii,
    });
    this.logger.log(`Contract created: id=${contract.id}, locking on Testnet`);

    // 2. 보증금 escrow (contract → tenant)
    const deposit = await this.escrowService.createEscrow({
      account: input.contractWallet,
      destination: input.tenantAddress,
      amount: input.depositAmount,
      finishAfter: input.finishAfter,
      cancelAfter: input.cancelAfter,
    });

    // 3. Stake escrow (contract → landlord)
    const stake = await this.escrowService.createEscrow({
      account: input.contractWallet,
      destination: input.landlordAddress,
      amount: input.stakeAmount,
      finishAfter: input.finishAfter,
      cancelAfter: input.cancelAfter,
    });

    // 4. 3-of-3 SignerListSet on contract account (quorum 2)
    const signerList = await this.signerListService.setSignerList({
      account: input.contractWallet,
      signers: [
        { account: input.tenantAddress, weight: 1 },
        { account: input.landlordAddress, weight: 1 },
        { account: input.operatorAddress, weight: 1 },
      ],
      quorum: 2,
    });

    // 5. Contract row 업데이트 (seed도 암호화 영속 — Reconciler가 Payment 서명 시 사용)
    if (!input.contractWallet.seed) {
      throw new Error('contractWallet must have a seed for persistence');
    }
    await this.repo.update(contract.id, {
      contractAccountAddress: input.contractWallet.classicAddress,
      contractAccountSeedCipher: this.encryption.encrypt(
        input.contractWallet.seed,
      ),
      depositEscrowSequence: deposit.escrowSequence,
      depositEscrowTxHash: deposit.txHash,
      stakeEscrowSequence: stake.escrowSequence,
      stakeEscrowTxHash: stake.txHash,
      signerListTxHash: signerList.txHash,
      status: ContractStatus.Locked,
    });

    const updated = await this.findById(contract.id);
    if (!updated) {
      throw new Error(`Contract ${contract.id} disappeared after lock update`);
    }
    this.logger.log(
      `Contract locked: id=${updated.id}, deposit=${deposit.txHash}, stake=${stake.txHash}, signerList=${signerList.txHash}`,
    );
    return updated;
  }

  private toDto(c: Contract): ContractDto {
    const {
      tenantPiiCipher,
      landlordPiiCipher,
      contractAccountSeedCipher,
      ...rest
    } = c;
    return {
      ...rest,
      tenantPii: this.encryption.decrypt(tenantPiiCipher),
      landlordPii: this.encryption.decrypt(landlordPiiCipher),
      contractAccountSeed: contractAccountSeedCipher
        ? this.encryption.decrypt(contractAccountSeedCipher)
        : null,
    };
  }
}
