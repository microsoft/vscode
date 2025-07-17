global class ChatPostMessageResponse {
	global ChatPostMessageResponse() { }
	global Object clone() { }
	global String getChannel() { }
	global String getDeprecatedArgument() { }
	global String getError() { }
	global List<String> getErrors() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global Slack.Message getMessage() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ErrorResponseMetadata getResponseMetadata() { }
	global String getTs() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(String channel) { }
	global void setDeprecatedArgument(String deprecatedArgument) { }
	global void setError(String error) { }
	global void setErrors(List<String> errors) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessage(Slack.Message message) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ErrorResponseMetadata responseMetadata) { }
	global void setTs(String ts) { }
	global void setWarning(String warning) { }
	global String toString() { }

}