global class InsuranceQuoteOutputRepresentation {
	global List<ConnectApi.InsuranceConfigMessageOutputRepresentation> configMessages;
	global String contextId;
	global List<ConnectApi.ErrorResponseRepresentation> errors;
	global Map<String,Object> quoteDetails;
	global String quoteId;
	global Boolean success;
	global InsuranceQuoteOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}