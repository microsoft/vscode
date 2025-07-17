global class ConversationsHistoryResponse {
	global ConversationsHistoryResponse() { }
	global Object clone() { }
	global Integer getChannelActionsCount() { }
	global String getChannelActionsTs() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getLatest() { }
	global List<Slack.Message> getMessages() { }
	global String getNeeded() { }
	global String getOldest() { }
	global Integer getPinCount() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isHasMore() { }
	global Boolean isOk() { }
	global void setChannelActionsCount(Integer channelActionsCount) { }
	global void setChannelActionsTs(String channelActionsTs) { }
	global void setError(String error) { }
	global void setHasMore(Boolean hasMore) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setLatest(String latest) { }
	global void setMessages(List<Slack.Message> messages) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setOldest(String oldest) { }
	global void setPinCount(Integer pinCount) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}