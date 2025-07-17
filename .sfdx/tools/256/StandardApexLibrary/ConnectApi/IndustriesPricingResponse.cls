global class IndustriesPricingResponse {
	global String apiExecutionId;
	global ConnectApi.PricingErrorResponse error;
	global String executionId;
	global String pricingExecutionId;
	global List<ConnectApi.ProcedureConfigOutputRepresentation> procedureResponses;
	global Boolean success;
	global IndustriesPricingResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}