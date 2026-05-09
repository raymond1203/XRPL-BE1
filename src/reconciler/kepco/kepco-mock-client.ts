import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  KepcoClient,
  KepcoQueryParams,
  MonthlyUsage,
} from './kepco-client.interface';

/**
 * 한전 파워플래너 API의 deterministic mock.
 * (contractId + yearMonth) → SHA-256 → 사용량/요금 분배.
 *
 * 같은 입력 = 같은 출력 → 테스트 멱등성 + 데모 시 시뮬레이션 일관성.
 */
@Injectable()
export class KepcoMockClient implements KepcoClient {
  private static readonly UNIT_PRICE_KRW_PER_KWH = 120;
  private static readonly MIN_KWH = 100;
  private static readonly RANGE_KWH = 400; // 100-499

  getMonthlyUsage(params: KepcoQueryParams): Promise<MonthlyUsage> {
    const seed = `${params.contractId}|${params.yearMonth}`;
    const buf = createHash('sha256').update(seed).digest();
    const usageKwh =
      (buf.readUInt32BE(0) % KepcoMockClient.RANGE_KWH) +
      KepcoMockClient.MIN_KWH;
    const chargeKrw = usageKwh * KepcoMockClient.UNIT_PRICE_KRW_PER_KWH;
    return Promise.resolve({
      contractId: params.contractId,
      yearMonth: params.yearMonth,
      usageKwh,
      chargeKrw,
      meterReadingDate: new Date(`${params.yearMonth}-28T00:00:00Z`),
    });
  }
}
