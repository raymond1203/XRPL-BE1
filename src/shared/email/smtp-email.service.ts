import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EmailMessage, EmailService } from './email.interface';

/**
 * 운영용 SMTP 어댑터.
 * 본선에서 SES/Sendgrid로 transport 교체 시 본 구현체 한 곳만 변경.
 *
 * SMTP_* / EMAIL_FROM 누락 시 send 첫 호출 시점에 에러(lazy).
 */
@Injectable()
export class SmtpEmailService implements EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private transporter?: Transporter;

  constructor(private readonly cfg: ConfigService) {}

  private getTransporter(): { transporter: Transporter; from: string } {
    const host = this.cfg.get<string>('SMTP_HOST') ?? '';
    const port = Number(this.cfg.get<string>('SMTP_PORT') ?? '0');
    const user = this.cfg.get<string>('SMTP_USER') ?? '';
    const pass = this.cfg.get<string>('SMTP_PASS') ?? '';
    const from = this.cfg.get<string>('EMAIL_FROM') ?? '';
    if (!host || !port || !from) {
      throw new Error(
        'SMTP_HOST/SMTP_PORT/EMAIL_FROM 미설정 — SmtpEmailService 호출 불가. ' +
          'EMAIL_USE_CONSOLE=true 로 console 어댑터 전환 가능.',
      );
    }
    if (!this.transporter) {
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
    }
    return { transporter: this.transporter, from };
  }

  async send(message: EmailMessage): Promise<void> {
    const { transporter, from } = this.getTransporter();
    const info = (await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    })) as { messageId?: string };
    this.logger.log(
      `EMAIL (smtp) to=${message.to} subject="${message.subject}" messageId=${info.messageId ?? 'n/a'}`,
    );
  }
}
