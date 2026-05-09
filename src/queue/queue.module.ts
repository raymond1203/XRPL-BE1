import { Module } from '@nestjs/common';

/**
 * 공유 큐 인프라.
 * - 후속 작업에서 BullModule.forRootAsync로 Redis 연결 셋업
 * - 도메인별 큐(예: 'xrpl-tx')는 각 도메인 모듈에서 BullModule.registerQueue로 등록
 */
@Module({})
export class QueueModule {}
