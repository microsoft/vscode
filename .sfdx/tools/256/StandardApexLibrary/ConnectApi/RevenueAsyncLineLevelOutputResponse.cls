global class RevenueAsyncLineLevelOutputResponse {
	global List<ConnectApi.ErrorResponse> errors;
	global List<ConnectApi.ReferenceLineError> referenceLineErrorResults;
	global String referenceLineType;
	global String requestIdentifier;
	global String statusURL;
	global Boolean success;
	global RevenueAsyncLineLevelOutputResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}