import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 공유 큐 인프라.
 * - BullMQ Redis connection 단일 셋업
 * - @Global 모듈로 등록 — 각 도메인 모듈은 BullModule.registerQueue만 import해서 큐 추가
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        connection: {
          host: cfg.getOrThrow<string>('REDIS_HOST'),
          port: cfg.getOrThrow<number>('REDIS_PORT'),
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
