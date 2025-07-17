global class ChatUpdateResponse {
	global ChatUpdateResponse() { }
	global Object clone() { }
	global String getChannel() { }
	global String getDeprecatedArgument() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global Slack.Message getMessage() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ErrorResponseMetadata getResponseMetadata() { }
	global String getText() { }
	global String getTs() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(String channel) { }
	global void setDeprecatedArgument(String deprecatedArgument) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessage(Slack.Message message) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ErrorResponseMetadata responseMetadata) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setWarning(String warning) { }
	global String toString() { }

}