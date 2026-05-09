import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XrplModule } from '../xrpl/xrpl.module';
import { Contract } from './contract.entity';
import { ContractsService } from './contracts.service';

/**
 * 계약/PII 도메인 (W5).
 * - Contract entity (PII 컬럼 ciphertext)
 * - ContractsService:
 *   - PII 암복호화 (ENCRYPTION_SERVICE 통한)
 *   - lockTenantDeposit — XrplModule의 EscrowService/SignerListService 결합
 *     (보증금 + Stake + SignerListSet 3건 트랜잭션 orchestration)
 */
@Module({
  imports: [TypeOrmModule.forFeature([Contract]), XrplModule],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
