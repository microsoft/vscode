global class TeamAccessLogsResponse {
	global TeamAccessLogsResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.Login> getLogins() { }
	global String getNeeded() { }
	global Slack.Paging getPaging() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setLogins(List<Slack.Login> logins) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPaging(Slack.Paging paging) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }

}