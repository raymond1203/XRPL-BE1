import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../contracts/contracts.module';
import { XrplModule } from '../xrpl/xrpl.module';
import { KEPCO_CLIENT } from './kepco/kepco-client.interface';
import { KepcoMockClient } from './kepco/kepco-mock-client';
import { ReconcilerService } from './reconciler.service';
import { Reconciliation } from './reconciliation.entity';

/**
 * 월별 정산 모듈 (W6).
 * - 한전 파워플래너 API 연동 (예선: KepcoMockClient)
 * - 임대인 청구액 대조
 * - @Cron(EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, { timeZone: 'Asia/Seoul' })
 * - 결과: Payment + Memo(SHA-256 해시) 트랜잭션 발사 + Reconciliation row 영속
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reconciliation]),
    XrplModule,
    ContractsModule,
  ],
  providers: [
    ReconcilerService,
    { provide: KEPCO_CLIENT, useClass: KepcoMockClient },
  ],
  exports: [ReconcilerService],
})
export class ReconcilerModule {}
