global class AppsEventAuthorizationsListResponse {
	global AppsEventAuthorizationsListResponse() { }
	global Object clone() { }
	global List<Slack.AppsEventAuthorizationsListResponse.Authorization> getAuthorizations() { }
	global String getCursorNext() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setAuthorizations(List<Slack.AppsEventAuthorizationsListResponse.Authorization> authorizations) { }
	global void setCursorNext(String cursorNext) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Authorization {
	global AppsEventAuthorizationsListResponse.Authorization() { }
	global Object clone() { }
	global String getEnterpriseId() { }
	global Boolean getIsBot() { }
	global Boolean getIsEnterpriseInstall() { }
	global String getTeamId() { }
	global String getUserId() { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setIsBot(Boolean isBot) { }
	global void setIsEnterpriseInstall(Boolean isEnterpriseInstall) { }
	global void setTeamId(String teamId) { }
	global void setUserId(String userId) { }

}

}