import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ENCRYPTION_SERVICE,
  type EncryptionService,
} from '../shared/crypto/encryption.interface';
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
}

export interface ContractDto {
  id: string;
  tenantAddress: string;
  landlordAddress: string;
  contractAccountAddress: string | null;
  depositAmount: string;
  stakeAmount: string;
  depositEscrowSequence: number | null;
  stakeEscrowSequence: number | null;
  signerListTxHash: string | null;
  status: ContractStatus;
  startsAt: Date;
  endsAt: Date;
  finishAfter: Date;
  cancelAfter: Date;
  tenantPii: string; // 복호화된 평문
  landlordPii: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract) private readonly repo: Repository<Contract>,
    @Inject(ENCRYPTION_SERVICE) private readonly encryption: EncryptionService,
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
      status: ContractStatus.Pending,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async findById(id: string): Promise<ContractDto | null> {
    const found = await this.repo.findOneBy({ id });
    return found ? this.toDto(found) : null;
  }

  private toDto(c: Contract): ContractDto {
    const { tenantPiiCipher, landlordPiiCipher, ...rest } = c;
    return {
      ...rest,
      tenantPii: this.encryption.decrypt(tenantPiiCipher),
      landlordPii: this.encryption.decrypt(landlordPiiCipher),
    };
  }
}
