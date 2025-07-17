global class ConversationsCloseResponse {
	global ConversationsCloseResponse() { }
	global Object clone() { }
	global Boolean getAlreadyClosed() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global Boolean getNoOp() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setAlreadyClosed(Boolean alreadyClosed) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setNoOp(Boolean noOp) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }

}