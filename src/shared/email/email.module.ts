import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleEmailService } from './console-email.service';
import { EMAIL_SERVICE, type EmailService } from './email.interface';
import { SmtpEmailService } from './smtp-email.service';

/**
 * 이메일 발송 모듈.
 * - NODE_ENV=test 또는 EMAIL_USE_CONSOLE=true → ConsoleEmailService
 * - 그 외 → SmtpEmailService
 */
@Module({
  providers: [
    ConsoleEmailService,
    SmtpEmailService,
    {
      provide: EMAIL_SERVICE,
      inject: [ConfigService, ConsoleEmailService, SmtpEmailService],
      useFactory: (
        cfg: ConfigService,
        consoleSvc: ConsoleEmailService,
        smtpSvc: SmtpEmailService,
      ): EmailService => {
        const useConsole =
          cfg.get<string>('NODE_ENV') === 'test' ||
          cfg.get<string>('EMAIL_USE_CONSOLE') === 'true';
        return useConsole ? consoleSvc : smtpSvc;
      },
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
