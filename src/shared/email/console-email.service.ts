import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailService } from './email.interface';

/**
 * 개발/테스트용 이메일 어댑터 — 실제 발송 대신 콘솔 로그.
 * NODE_ENV=test 또는 EMAIL_USE_CONSOLE=true 일 때 활성화.
 */
@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);

  send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `EMAIL (console) to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
    return Promise.resolve();
  }
}
