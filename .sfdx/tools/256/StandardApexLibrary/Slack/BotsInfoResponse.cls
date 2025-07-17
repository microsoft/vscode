global class BotsInfoResponse {
	global BotsInfoResponse() { }
	global Object clone() { }
	global Slack.BotsInfoResponse.Bot getBot() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setBot(Slack.BotsInfoResponse.Bot bot) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Bot {
	global BotsInfoResponse.Bot() { }
	global Object clone() { }
	global String getAppId() { }
	global Slack.BotIcons getIcons() { }
	global String getId() { }
	global String getName() { }
	global Integer getUpdated() { }
	global String getUserId() { }
	global Boolean isDeleted() { }
	global void setAppId(String appId) { }
	global void setDeleted(Boolean deleted) { }
	global void setIcons(Slack.BotIcons icons) { }
	global void setId(String id) { }
	global void setName(String name) { }
	global void setUpdated(Integer updated) { }
	global void setUserId(String userId) { }

}

}