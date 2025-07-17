global class CalculateTaxResponse {
	global ConnectApi.ErrorResponse adapterError;
	global ConnectApi.TaxTransactionState status;
	global List<ConnectApi.TaxEngineLogResponse> taxEngineLogs;
	global ConnectApi.TaxTransactionType taxTransactionType;
	global ConnectApi.CalculateTaxTypeRequest taxType;
	global CalculateTaxResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}