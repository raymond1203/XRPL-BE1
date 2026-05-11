import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * POST /reconciliations/run 입력 — 수동 cron 트리거 (dev/staging 데모용).
 * production에서는 라우트 자체가 차단되므로 본 DTO는 비프로덕션 환경에서만 의미.
 */
export class RunReconciliationDto {
  /** 'YYYY-MM'. 미지정 시 전월(KST) 사용. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth는 YYYY-MM 형식' })
  yearMonth?: string;

  /** 특정 계약만 정산. 미지정 시 모든 Locked. */
  @IsOptional()
  @IsString()
  contractId?: string;
}
