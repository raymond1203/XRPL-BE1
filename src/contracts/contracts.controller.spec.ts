/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Wallet } from 'xrpl';
import { XrplClientService } from '../xrpl/xrpl-client.service';
import { ContractStatus } from './contract-status.enum';
import { ContractsController } from './contracts.controller';
import { ContractsService, type ContractDto } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';

describe('ContractsController', () => {
  let controller: ContractsController;
  let contractsService: jest.Mocked<ContractsService>;
  let xrplClient: jest.Mocked<XrplClientService>;
  const operatorWallet = Wallet.generate();
  const baseDto: ContractDto = {
    id: '11111111-1111-1111-1111-111111111111',
    tenantAddress: 'rTenantAaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    landlordAddress: 'rLandlordAaaaaaaaaaaaaaaaaaaaaaaaaa',
    contractAccountAddress: 'rContractAaaaaaaaaaaaaaaaaaaaaaaaaa',
    contractAccountSeed: 'sEdSeedSeedSeedSeedSeedSeedSeedSeed',
    depositAmount: '10000000',
    stakeAmount: '3000000',
    depositEscrowSequence: 100,
    depositEscrowTxHash: 'A'.repeat(64),
    stakeEscrowSequence: 101,
    stakeEscrowTxHash: 'B'.repeat(64),
    signerListTxHash: 'C'.repeat(64),
    status: ContractStatus.Locked,
    startsAt: new Date('2026-05-01'),
    endsAt: new Date('2027-04-30'),
    finishAfter: new Date('2027-05-07'),
    cancelAfter: new Date('2027-05-30'),
    tenantPii: 'PII-tenant',
    landlordPii: 'PII-landlord',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    contractsService = {
      lockTenantDeposit: jest.fn().mockResolvedValue(baseDto),
      findById: jest.fn().mockResolvedValue(baseDto),
    } as unknown as jest.Mocked<ContractsService>;
    xrplClient = {
      generateAndFundWallet: jest.fn().mockResolvedValue(Wallet.generate()),
      getXrpBalance: jest.fn().mockResolvedValue('99.999988'),
    } as unknown as jest.Mocked<XrplClientService>;
    const cfg = {
      get: jest.fn((k: string) => {
        if (k === 'XRPL_OPERATOR_SEED') return operatorWallet.seed!;
        return undefined;
      }),
    } as unknown as ConfigService;

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: contractsService },
        { provide: XrplClientService, useValue: xrplClient },
        { provide: ConfigService, useValue: cfg },
      ],
    }).compile();
    controller = mod.get(ContractsController);
  });

  it('POST /contracts: PII/seed가 응답 DTO에서 제외', async () => {
    const inputDto = {
      tenantAddress: baseDto.tenantAddress,
      landlordAddress: baseDto.landlordAddress,
      depositAmount: baseDto.depositAmount,
      stakeAmount: baseDto.stakeAmount,
      startsAt: baseDto.startsAt,
      endsAt: baseDto.endsAt,
      finishAfter: baseDto.finishAfter,
      cancelAfter: baseDto.cancelAfter,
      tenantPii: 'PII-tenant',
      landlordPii: 'PII-landlord',
    };
    const response = await controller.create(inputDto);
    expect(response.id).toBe(baseDto.id);
    expect(response.depositEscrowTxHash).toBe(baseDto.depositEscrowTxHash);
    // 보안: PII / seed 절대 노출 X
    expect(response).not.toHaveProperty('tenantPii');
    expect(response).not.toHaveProperty('landlordPii');
    expect(response).not.toHaveProperty('contractAccountSeed');
    expect(contractsService.lockTenantDeposit).toHaveBeenCalled();
    expect(xrplClient.generateAndFundWallet).toHaveBeenCalled();
  });

  it('POST /contracts: XRPL_OPERATOR_SEED 미설정 시 400', async () => {
    const mod = await Test.createTestingModule({
      controllers: [ContractsController],
      providers: [
        { provide: ContractsService, useValue: contractsService },
        { provide: XrplClientService, useValue: xrplClient },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') } as never,
        },
      ],
    }).compile();
    const c = mod.get(ContractsController);
    await expect(c.create({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('GET /contracts/:id: 404 when not found', async () => {
    contractsService.findById.mockResolvedValueOnce(null);
    await expect(controller.findOne(baseDto.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('GET /contracts/:id/balance: XRPL 잔액 반환', async () => {
    const balance = await controller.balance(baseDto.id);
    expect(balance).toEqual({
      contractId: baseDto.id,
      address: baseDto.contractAccountAddress,
      balanceXrp: '99.999988',
    });
    expect(xrplClient.getXrpBalance).toHaveBeenCalledWith(
      baseDto.contractAccountAddress,
    );
  });

  it('ValidationPipe: 잘못된 tenantAddress 형식 reject', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        { ...baseDto, tenantAddress: 'INVALID' },
        { type: 'body', metatype: CreateContractDto },
      ),
    ).rejects.toThrow();
  });
});
