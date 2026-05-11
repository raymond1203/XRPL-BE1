import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ContractsService } from '../contracts/contracts.service';
import { NotProductionGuard } from '../shared/guards/not-production.guard';
import {
  type ReconciliationResponseDto,
  toReconciliationResponse,
} from './dto/reconciliation.response.dto';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';
import { ReconcilerService } from './reconciler.service';

@Controller()
export class ReconciliationsController {
  constructor(
    private readonly reconciler: ReconcilerService,
    private readonly contractsService: ContractsService,
  ) {}

  /** 계약별 월별 정산 이력 — 임차인 앱 월간 리포트 화면 데이터 */
  @Get('contracts/:contractId/reconciliations')
  async listByContract(
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ): Promise<ReconciliationResponseDto[]> {
    const contract = await this.contractsService.findById(contractId);
    if (!contract) {
      throw new NotFoundException(`Contract ${contractId} not found`);
    }
    const rows =
      await this.reconciler.findReconciliationsByContractId(contractId);
    return rows.map(toReconciliationResponse);
  }

  /** 수동 cron 트리거 — production 환경에서는 404 */
  @Post('reconciliations/run')
  @UseGuards(NotProductionGuard)
  async runManual(
    @Body() dto: RunReconciliationDto,
  ): Promise<{ yearMonth: string; processed: number }> {
    return this.reconciler.runManualReconcile(dto);
  }
}
