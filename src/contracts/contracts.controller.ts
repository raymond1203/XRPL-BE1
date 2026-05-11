import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallet } from 'xrpl';
import { XrplClientService } from '../xrpl/xrpl-client.service';
import { ContractsService } from './contracts.service';
import type { ContractBalanceResponseDto } from './dto/contract-balance.response.dto';
import {
  type ContractResponseDto,
  toContractResponse,
} from './dto/contract.response.dto';
import { CreateContractDto } from './dto/create-contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly xrplClient: XrplClientService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * 계약 생성 + lockTenantDeposit(보증금 Escrow + Stake Escrow + SignerListSet).
   * 동기 호출(faucet + 3건 트랜잭션) — 보통 10-30초 소요.
   */
  @Post()
  async create(@Body() dto: CreateContractDto): Promise<ContractResponseDto> {
    const operatorSeed = this.cfg.get<string>('XRPL_OPERATOR_SEED') ?? '';
    if (!operatorSeed) {
      throw new BadRequestException(
        'XRPL_OPERATOR_SEED 미설정 — 계약 생성 불가',
      );
    }
    const operatorWallet = Wallet.fromSeed(operatorSeed);
    const contractWallet = await this.xrplClient.generateAndFundWallet();
    const locked = await this.contractsService.lockTenantDeposit({
      ...dto,
      contractWallet,
      operatorAddress: operatorWallet.classicAddress,
    });
    return toContractResponse(locked);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractResponseDto> {
    const found = await this.contractsService.findById(id);
    if (!found) {
      throw new NotFoundException(`Contract ${id} not found`);
    }
    return toContractResponse(found);
  }

  @Get(':id/balance')
  async balance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContractBalanceResponseDto> {
    const found = await this.contractsService.findById(id);
    if (!found) {
      throw new NotFoundException(`Contract ${id} not found`);
    }
    if (!found.contractAccountAddress) {
      throw new BadRequestException(
        `Contract ${id} has no contractAccountAddress (locked 전?)`,
      );
    }
    const balanceXrp = await this.xrplClient.getXrpBalance(
      found.contractAccountAddress,
    );
    return {
      contractId: found.id,
      address: found.contractAccountAddress,
      balanceXrp,
    };
  }
}
