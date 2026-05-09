import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'xrpl';

@Injectable()
export class XrplClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(XrplClientService.name);
  private client?: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('XRPL_NETWORK_URL');
    this.client = new Client(url);
    await this.client.connect();
    this.logger.log(`Connected to XRPL: ${url}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isConnected()) {
      await this.client.disconnect();
      this.logger.log('Disconnected from XRPL');
    }
  }

  /**
   * Live xrpl.js Client 인스턴스 반환. 미연결 시 throw.
   * 호출자는 client.submitAndWait / client.request 등을 직접 사용.
   */
  getClient(): Client {
    if (!this.client?.isConnected()) {
      throw new Error('XRPL client is not connected');
    }
    return this.client;
  }
}
