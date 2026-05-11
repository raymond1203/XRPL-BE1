import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractStatus } from './contract-status.enum';

/**
 * 계약 영속화 entity. PII 컬럼(`tenantPiiCipher`, `landlordPiiCipher`)은
 * ciphertext at rest — ContractsService에서만 encrypt/decrypt 처리.
 *
 * Direct entity write (`repo.save(c)` with raw plaintext)는 PII 우회 위험 →
 * 항상 ContractsService.create / .update 통한 입출력 강제.
 */
@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 양 당사자 XRPL classic address (r... 25-35자)
  @Column({ length: 35 })
  tenantAddress!: string;

  @Column({ length: 35 })
  landlordAddress!: string;

  /** BlueSafe가 계약마다 만드는 escrow source account (생성 후 채움) */
  @Column({ type: 'varchar', length: 35, nullable: true })
  contractAccountAddress!: string | null;

  /** contract account의 seed (AES-GCM 암호문) — 월별 cron이 Payment 서명 시 필요 */
  @Column({ type: 'text', nullable: true })
  contractAccountSeedCipher!: string | null;

  // 금액 (XRP drops, string 저장 — 64비트 정수도 안전)
  @Column()
  depositAmount!: string;

  @Column()
  stakeAmount!: string;

  // 후속 작업에서 채움 (lockTenantDeposit 시점)
  @Column({ type: 'int', nullable: true })
  depositEscrowSequence!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  depositEscrowTxHash!: string | null;

  @Column({ type: 'int', nullable: true })
  stakeEscrowSequence!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  stakeEscrowTxHash!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  signerListTxHash!: string | null;

  @Column({ type: 'varchar', length: 32, default: ContractStatus.Pending })
  status!: ContractStatus;

  // 시점
  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'timestamptz' })
  endsAt!: Date;

  /** 정상 escrow finish 가능 시점 (보통 endsAt + 7일) */
  @Column({ type: 'timestamptz' })
  finishAfter!: Date;

  /** 자동 환불 시점 (보통 endsAt + 30일) */
  @Column({ type: 'timestamptz' })
  cancelAfter!: Date;

  // PII (AES-256-GCM 암호화) — 평문 직접 저장 금지
  @Column({ type: 'text' })
  tenantPiiCipher!: string;

  @Column({ type: 'text' })
  landlordPiiCipher!: string;

  /** 월간 정산 리포트 발송 대상 — 부재 시 발송 skip */
  @Column({ type: 'varchar', length: 255, nullable: true })
  tenantEmail!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
