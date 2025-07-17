global class RevenueElementRequest {
	global Double amount;
	global String currencyIsoCode;
	global Datetime endDate;
	global String externalReference;
	global String externalReferenceDataSource;
	global String financeBookId;
	global Datetime fullRecognitionDate;
	global String legalEntityId;
	global String matchingId;
	global String referenceEntityItem;
	global Double revenueAllocationAmount;
	global Double revenueExpectedAmount;
	global Double revenueLiabilityAmount;
	global String revenueRecognitionPolicyId;
	global String revenueRecognitionTreatmentId;
	global ConnectApi.RevenueRecognitionType revenueRecognitionType;
	global Datetime startDate;
	global RevenueElementRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}