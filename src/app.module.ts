import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().port().default(3000),

        // XRPL Testnet (디폴트는 공개 Testnet 엔드포인트)
        XRPL_NETWORK_URL: Joi.string()
          .uri({ scheme: ['ws', 'wss'] })
          .default('wss://s.altnet.rippletest.net:51233'),
        XRPL_EXPLORER_URL: Joi.string()
          .uri()
          .default('https://testnet.xrpl.org'),
        XRPL_FAUCET_URL: Joi.string()
          .uri()
          .default('https://faucet.altnet.rippletest.net/accounts'),

        // 운영 지갑 시드 — 비어있으면 부팅은 OK, TX 호출 시점에 실패
        XRPL_OPERATOR_SEED: Joi.string().allow('').default(''),

        // PostgreSQL
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgresql', 'postgres'] })
          .default(
            'postgresql://postgres:postgres@localhost:5432/bluesafe_dev',
          ),

        // Redis (BullMQ)
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().port().default(6379),

        // 한전 파워플래너 API (W6에서 활성화)
        KEPCO_API_KEY: Joi.string().allow('').default(''),
        KEPCO_API_BASE_URL: Joi.string().uri().allow('').default(''),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
