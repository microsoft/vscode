global class EndorsePolicyInputRepresentation {
	global List<ConnectApi.AdditionalFieldsMapValue> additionalFields;
	global String contextId;
	global String effectiveDate;
	global ConnectApi.InsurancePolicyInputRepresentation insurancePolicy;
	global ConnectApi.InsurancePolicyTransactionInputRepresentation transactionRecord;
	global EndorsePolicyInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}