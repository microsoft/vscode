global class ReactionsGetResponse {
	global ReactionsGetResponse() { }
	global Object clone() { }
	global String getChannel() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global Slack.ReactionsGetResponse.Message getMessage() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getType() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(String channel) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessage(Slack.ReactionsGetResponse.Message message) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setType(String type) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Message {
	global ReactionsGetResponse.Message() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getPermalink() { }
	global List<Slack.Reaction> getReactions() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global String getUsername() { }
	global void setAppId(String appId) { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setPermalink(String permalink) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }

}

}