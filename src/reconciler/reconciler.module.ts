import { Module } from '@nestjs/common';

/**
 * 월별 정산 모듈 (W6).
 * - 한전 파워플래너 API 연동 (월별 사용량 조회)
 * - 임대인 청구액 대조
 * - @Cron(EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT, { timeZone: 'Asia/Seoul' })
 * - 결과: Payment + Memo(SHA-256 해시) 트랜잭션을 큐에 enqueue
 */
@Module({})
export class ReconcilerModule {}
