export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

export interface EmailMessage {
  to: string;
  subject: string;
  /** plain text body (HTML 본문은 후속 작업) */
  text: string;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
