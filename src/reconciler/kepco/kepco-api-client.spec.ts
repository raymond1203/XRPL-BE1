import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import nock from 'nock';
import { KepcoApiClient } from './kepco-api-client';

describe('KepcoApiClient (통합 — nock으로 OPM 가짜 응답)', () => {
  const baseUrl = 'https://opm-mock.test';
  const serviceKey = 'test-service-key';
  let mod: TestingModule;
  let client: KepcoApiClient;

  beforeAll(async () => {
    process.env.KEPCO_API_BASE_URL = baseUrl;
    process.env.KEPCO_API_KEY = serviceKey;
    mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        HttpModule,
      ],
      providers: [KepcoApiClient],
    }).compile();
    client = mod.get(KepcoApiClient);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(async () => {
    await mod.close();
    delete process.env.KEPCO_API_BASE_URL;
    delete process.env.KEPCO_API_KEY;
  });

  it('OPM 청구정보 SUCCESS 응답을 MonthlyUsage로 매핑', async () => {
    nock(baseUrl)
      .get('/bill')
      .query({
        serviceKey,
        custNo: 'contract-uuid-1',
        billYm: '202604',
      })
      .reply(200, {
        result: 'SUCCESS',
        data: {
          custNo: 'contract-uuid-1',
          billYm: '202604',
          kwh: 320,
          billAmt: 56400,
          dueDate: '20260520',
          measureFromDt: '20260321',
          measureToDt: '20260420',
        },
      });

    const usage = await client.getMonthlyUsage({
      contractId: 'contract-uuid-1',
      yearMonth: '2026-04',
    });

    expect(usage).toEqual({
      contractId: 'contract-uuid-1',
      yearMonth: '2026-04',
      usageKwh: 320,
      chargeKrw: 56400,
      meterReadingDate: new Date(Date.UTC(2026, 3, 20)),
    });
  });

  it('OPM result=FAIL 응답은 에러 throw', async () => {
    nock(baseUrl)
      .get('/bill')
      .query(true)
      .reply(200, {
        result: 'FAIL',
        resultMsg: 'NO_DATA',
        data: {
          custNo: '',
          billYm: '',
          kwh: 0,
          billAmt: 0,
          dueDate: '',
          measureFromDt: '',
          measureToDt: '',
        },
      });

    await expect(
      client.getMonthlyUsage({
        contractId: 'contract-uuid-2',
        yearMonth: '2026-04',
      }),
    ).rejects.toThrow('OPM bill API 실패: FAIL NO_DATA');
  });
});
