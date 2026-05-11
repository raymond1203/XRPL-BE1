import { ContractStatus } from '../contract-status.enum';
import type { ContractDto } from '../contracts.service';

/**
 * HTTP 응답용 Contract DTO.
 *
 * 내부 ContractDto의 tenantPii/landlordPii/contractAccountSeed는 절대 노출 금지.
 * toContractResponse 변환을 거치지 않은 그대로 응답하면 PII가 새 나가므로
 * Controller가 항상 본 변환을 거치도록 강제.
 */
export interface ContractResponseDto {
  id: string;
  tenantAddress: string;
  landlordAddress: string;
  contractAccountAddress: string | null;
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
  tenantEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toContractResponse(dto: ContractDto): ContractResponseDto {
  return {
    id: dto.id,
    tenantAddress: dto.tenantAddress,
    landlordAddress: dto.landlordAddress,
    contractAccountAddress: dto.contractAccountAddress,
    depositAmount: dto.depositAmount,
    stakeAmount: dto.stakeAmount,
    depositEscrowSequence: dto.depositEscrowSequence,
    depositEscrowTxHash: dto.depositEscrowTxHash,
    stakeEscrowSequence: dto.stakeEscrowSequence,
    stakeEscrowTxHash: dto.stakeEscrowTxHash,
    signerListTxHash: dto.signerListTxHash,
    status: dto.status,
    startsAt: dto.startsAt,
    endsAt: dto.endsAt,
    finishAfter: dto.finishAfter,
    cancelAfter: dto.cancelAfter,
    tenantEmail: dto.tenantEmail,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
