global class StandaloneCreditMemoInputRequest {
	global List<ConnectApi.StandaloneCreditMemoAdjustmentInputRequest> adjustments;
	global String billToContactId;
	global String billingAccountId;
	global List<ConnectApi.StandaloneCreditMemoChargeInputRequest> charges;
	global String currencyIsoCode;
	global String description;
	global String effectiveDate;
	global String externalReference;
	global String externalReferenceDataSource;
	global String taxEffectiveDate;
	global ConnectApi.StandaloneTaxStrategyEnum taxStrategy;
	global ConnectApi.CreditMemoTypeEnum type;
	global StandaloneCreditMemoInputRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}