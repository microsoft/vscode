global class ConversationsJoinResponse {
	global ConversationsJoinResponse() { }
	global Object clone() { }
	global Slack.Conversation getChannel() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.WarningResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(Slack.Conversation channel) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.WarningResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}