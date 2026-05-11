export interface ContractBalanceResponseDto {
  contractId: string;
  address: string;
  /** XRP 소수점 표기 (drops → XRP 변환됨) */
  balanceXrp: string;
}
