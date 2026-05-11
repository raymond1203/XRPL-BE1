import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * POST /contracts 입력 DTO.
 * tenantPii/landlordPii는 평문으로 받으며 ContractsService 내부에서 AES-256-GCM 암호화.
 * 본선에서 KYC API 연동 시 PII 필드는 별도 위임 흐름으로 분리.
 */
export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^r[a-zA-Z0-9]{24,34}$/, { message: 'tenantAddress 형식 오류' })
  tenantAddress!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^r[a-zA-Z0-9]{24,34}$/, { message: 'landlordAddress 형식 오류' })
  landlordAddress!: string;

  /** XRP drops 단위(정수 문자열) */
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'depositAmount는 drops 정수 문자열' })
  depositAmount!: string;

  @IsString()
  @Matches(/^[0-9]+$/, { message: 'stakeAmount는 drops 정수 문자열' })
  stakeAmount!: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @Type(() => Date)
  @IsDate()
  finishAfter!: Date;

  @Type(() => Date)
  @IsDate()
  cancelAfter!: Date;

  @IsString()
  @IsNotEmpty()
  tenantPii!: string;

  @IsString()
  @IsNotEmpty()
  landlordPii!: string;

  /** 월간 리포트 이메일 수신지. 미지정 시 발송 skip. */
  @IsOptional()
  @IsEmail()
  tenantEmail?: string;
}
