global class ChatScheduledMessagesListResponse {
	global ChatScheduledMessagesListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global List<Slack.ChatScheduledMessagesListResponse.ScheduledMessage> getScheduledMessages() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setScheduledMessages(List<Slack.ChatScheduledMessagesListResponse.ScheduledMessage> scheduledMessages) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class ScheduledMessage {
	global ChatScheduledMessagesListResponse.ScheduledMessage() { }
	global Object clone() { }
	global String getChannelId() { }
	global Integer getDateCreated() { }
	global String getId() { }
	global Integer getPostAt() { }
	global String getText() { }
	global void setChannelId(String channelId) { }
	global void setDateCreated(Integer dateCreated) { }
	global void setId(String id) { }
	global void setPostAt(Integer postAt) { }
	global void setText(String text) { }

}

}