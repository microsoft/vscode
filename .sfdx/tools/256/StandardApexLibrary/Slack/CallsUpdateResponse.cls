global class CallsUpdateResponse {
	global CallsUpdateResponse() { }
	global Object clone() { }
	global Slack.Call getCall() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setCall(Slack.Call call) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}