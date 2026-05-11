import { Logger } from '@nestjs/common';
import { ConsoleEmailService } from './console-email.service';

describe('ConsoleEmailService', () => {
  it('send 호출 시 logger.log에 message 정보 출력', async () => {
    const service = new ConsoleEmailService();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await service.send({
      to: 'x@example.com',
      subject: 'hello',
      text: 'world',
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('to=x@example.com'),
    );
    spy.mockRestore();
  });
});
