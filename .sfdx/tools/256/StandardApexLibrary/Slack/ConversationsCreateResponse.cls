global class ConversationsCreateResponse {
	global ConversationsCreateResponse() { }
	global Object clone() { }
	global Slack.Conversation getChannel() { }
	global String getDetail() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(Slack.Conversation channel) { }
	global void setDetail(String detail) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }

}