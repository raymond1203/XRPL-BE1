import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReconciliationStatus } from './reconciliation-status.enum';

/**
 * 월별 정산 이벤트 영속.
 * - 1 cron 실행 = (Locked 계약 N개) × (정산 attempt) → Reconciliation N row
 * - W7 "월간 리포트 이메일"이 이 row를 조회해서 사용자에게 발송
 */
@Entity('reconciliations')
export class Reconciliation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 36 })
  contractId!: string; // FK 안 걸음 — 단순 식별자, 향후 강화

  @Index()
  @Column({ length: 7 })
  yearMonth!: string; // 'YYYY-MM'

  @Column({ type: 'int' })
  kepcoUsageKwh!: number;

  @Column({ type: 'int' })
  kepcoChargeKrw!: number;

  /** SHA-256(JSON.stringify(KEPCO 응답)) — Memo로 ledger에 기록된 동일 값 */
  @Column({ type: 'varchar', length: 64 })
  kepcoUsageHash!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: ReconciliationStatus;

  /** matched 상태일 때 발사한 Payment+Memo 트랜잭션 hash */
  @Column({ type: 'varchar', length: 64, nullable: true })
  paymentTxHash!: string | null;

  /** failed 상태일 때 원인 — 운영자 디버깅용 */
  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  /** 임차인에게 월간 리포트 이메일 발송된 시각. null = 미발송 (중복 방지용) */
  @Column({ type: 'timestamptz', nullable: true })
  reportSentAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
