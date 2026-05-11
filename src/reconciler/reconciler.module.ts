import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractsModule } from '../contracts/contracts.module';
import { XRPL_TX_RETRY_QUEUE } from '../queue/xrpl-tx-retry.types';
import { EmailModule } from '../shared/email/email.module';
import { XrplModule } from '../xrpl/xrpl.module';
import { KepcoApiClient } from './kepco/kepco-api-client';
import { KEPCO_CLIENT, type KepcoClient } from './kepco/kepco-client.interface';
import { KepcoMockClient } from './kepco/kepco-mock-client';
import { ReconcilerService } from './reconciler.service';
import { ReconciliationsController } from './reconciliations.controller';
import { Reconciliation } from './reconciliation.entity';
import { XrplTxRetryProcessor } from './xrpl-tx-retry.processor';
import { NotProductionGuard } from '../shared/guards/not-production.guard';

/**
 * 월별 정산 모듈 (W6+).
 * - 한전 OPM API 연동 (NODE_ENV=test 또는 KEPCO_USE_MOCK=true → KepcoMockClient)
 * - 임대인 청구액 대조
 * - @Cron(EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, { timeZone: 'Asia/Seoul' })
 * - 결과: Payment + Memo(SHA-256 해시) 트랜잭션 발사 + Reconciliation row 영속
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Reconciliation]),
    HttpModule,
    BullModule.registerQueue({
      name: XRPL_TX_RETRY_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
    XrplModule,
    ContractsModule,
    EmailModule,
  ],
  controllers: [ReconciliationsController],
  providers: [
    ReconcilerService,
    XrplTxRetryProcessor,
    NotProductionGuard,
    KepcoMockClient,
    KepcoApiClient,
    {
      provide: KEPCO_CLIENT,
      inject: [ConfigService, KepcoMockClient, KepcoApiClient],
      useFactory: (
        cfg: ConfigService,
        mock: KepcoMockClient,
        api: KepcoApiClient,
      ): KepcoClient => {
        const useMock =
          cfg.get<string>('NODE_ENV') === 'test' ||
          cfg.get<string>('KEPCO_USE_MOCK') === 'true';
        return useMock ? mock : api;
      },
    },
  ],
  exports: [ReconcilerService],
})
export class ReconcilerModule {}
