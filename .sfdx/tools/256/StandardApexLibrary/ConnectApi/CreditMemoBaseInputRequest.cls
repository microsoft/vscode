global class CreditMemoBaseInputRequest {
	global ConnectApi.CreditMemoAddressesInputRequest addresses;
	global String description;
	global String endDate;
	global Boolean isTaxOnlyCredit;
	global String productId;
	global String productName;
	global String startDate;
	global String taxEffectiveDate;
	global ConnectApi.StandaloneTaxStrategyEnum taxStrategy;
	global List<ConnectApi.StandaloneCreditMemoTaxInputRequest> taxes;
	global String treatmentId;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}