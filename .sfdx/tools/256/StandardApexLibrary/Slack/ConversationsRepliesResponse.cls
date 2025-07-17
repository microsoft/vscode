global class ConversationsRepliesResponse {
	global ConversationsRepliesResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.Message> getMessages() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isHasMore() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHasMore(Boolean hasMore) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessages(List<Slack.Message> messages) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}