import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * production 환경에서 라우트를 404로 차단.
 * 수동 cron 트리거 같은 데모/운영 보조 라우트에 사용.
 */
@Injectable()
export class NotProductionGuard implements CanActivate {
  constructor(private readonly cfg: ConfigService) {}

  canActivate(): boolean {
    if (this.cfg.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    return true;
  }
}
