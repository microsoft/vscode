global class ChatScheduleMessageResponse {
	global ChatScheduleMessageResponse() { }
	global Object clone() { }
	global String getChannel() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global Slack.ChatScheduleMessageResponse.ScheduledMessage getMessage() { }
	global String getNeeded() { }
	global Integer getPostAt() { }
	global String getProvided() { }
	global Slack.ErrorResponseMetadata getResponseMetadata() { }
	global String getScheduledMessageId() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(String channel) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessage(Slack.ChatScheduleMessageResponse.ScheduledMessage message) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPostAt(Integer postAt) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ErrorResponseMetadata responseMetadata) { }
	global void setScheduledMessageId(String scheduledMessageId) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class ScheduledMessage {
	global ChatScheduleMessageResponse.ScheduledMessage() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getTeam() { }
	global String getText() { }
	global String getType() { }
	global String getUser() { }
	global void setAppId(String appId) { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setType(String type) { }
	global void setUser(String user) { }

}

}