import { ConfigService } from '@nestjs/config';
import { Client } from 'xrpl';
import { XrplClientService } from './xrpl-client.service';

jest.mock('xrpl');

const MockClient = Client as jest.MockedClass<typeof Client>;

describe('XrplClientService', () => {
  let service: XrplClientService;
  let mockConnect: jest.Mock;
  let mockDisconnect: jest.Mock;
  let mockIsConnected: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect = jest.fn().mockResolvedValue(undefined);
    mockDisconnect = jest.fn().mockResolvedValue(undefined);
    mockIsConnected = jest.fn().mockReturnValue(true);

    MockClient.mockImplementation(
      () =>
        ({
          connect: mockConnect,
          disconnect: mockDisconnect,
          isConnected: mockIsConnected,
        }) as unknown as Client,
    );

    const config = {
      getOrThrow: jest.fn().mockReturnValue('wss://test.example/'),
    } as unknown as ConfigService;
    service = new XrplClientService(config);
  });

  it('connects to XRPL network on module init', async () => {
    await service.onModuleInit();
    expect(MockClient).toHaveBeenCalledWith('wss://test.example/');
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy when connected', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not call disconnect if never connected', async () => {
    await service.onModuleDestroy();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('returns the client via getClient when connected', async () => {
    await service.onModuleInit();
    expect(service.getClient()).toBeDefined();
  });

  it('throws if getClient is called before connect', () => {
    expect(() => service.getClient()).toThrow(/not connected/);
  });

  it('throws if getClient is called after the client disconnects', async () => {
    await service.onModuleInit();
    mockIsConnected.mockReturnValue(false);
    expect(() => service.getClient()).toThrow(/not connected/);
  });
});
