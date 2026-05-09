import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './contract.entity';
import { ContractsService } from './contracts.service';

/**
 * 계약/PII 도메인 (W5).
 * - Contract entity (tenantPiiCipher / landlordPiiCipher 암호화 컬럼)
 * - ContractsService — PII 입출력 시점에 ENCRYPTION_SERVICE로 암복호화
 * - 후속: ContractsService.lockTenantDeposit 등 도메인 메서드 (XrplModule과 결합)
 */
@Module({
  imports: [TypeOrmModule.forFeature([Contract])],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
