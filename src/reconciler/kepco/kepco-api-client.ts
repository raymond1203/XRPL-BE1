import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type {
  KepcoClient,
  KepcoQueryParams,
  MonthlyUsage,
} from './kepco-client.interface';
import { mapOpmBillToMonthlyUsage } from './opm-response.mapper';
import type { OpmBillResponse } from './opm-response.types';

/**
 * 한전 OPM(Open P-Meter) 실 HTTP 클라이언트.
 *
 * 사업자 등록(opm.kepco.co.kr) + 활용신청 후 발급받은 serviceKey로 호출.
 * 응답 스키마는 OPM 안내서 수령 시 opm-response.types/mapper 두 곳 교체.
 *
 * Contract.id → KEPCO 고객번호 매핑은 별도 ContractsService에서 처리할 예정 — 본 클래스는
 * 외부 호출 + 응답 매핑까지만 책임. 현재는 contractId를 그대로 custNo로 위임(임시).
 */
@Injectable()
export class KepcoApiClient implements KepcoClient {
  private readonly logger = new Logger(KepcoApiClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly cfg: ConfigService,
  ) {}

  async getMonthlyUsage(params: KepcoQueryParams): Promise<MonthlyUsage> {
    const baseUrl = this.cfg.get<string>('KEPCO_API_BASE_URL') ?? '';
    const serviceKey = this.cfg.get<string>('KEPCO_API_KEY') ?? '';
    if (!baseUrl || !serviceKey) {
      throw new Error(
        'KEPCO_API_BASE_URL/KEPCO_API_KEY 미설정 — KepcoApiClient 호출 불가. ' +
          'KEPCO_USE_MOCK=true로 mock 전환 가능.',
      );
    }
    const billYm = params.yearMonth.replace('-', '');
    const url = `${baseUrl}/bill`;
    const response = await firstValueFrom(
      this.http.get<OpmBillResponse>(url, {
        params: {
          serviceKey,
          custNo: params.contractId,
          billYm,
        },
        timeout: 10_000,
      }),
    );
    const body = response.data;
    if (body.result !== 'SUCCESS') {
      throw new Error(
        `OPM bill API 실패: ${body.result} ${body.resultMsg ?? ''}`.trim(),
      );
    }
    const usage = mapOpmBillToMonthlyUsage(params.contractId, body.data);
    this.logger.log(
      `OPM bill fetched: contract=${params.contractId} ym=${params.yearMonth} ` +
        `kwh=${usage.usageKwh} krw=${usage.chargeKrw}`,
    );
    return usage;
  }
}
