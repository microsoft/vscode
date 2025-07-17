global class UsergroupsListResponse {
	global UsergroupsListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global List<Slack.Usergroup> getUsergroups() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setUsergroups(List<Slack.Usergroup> usergroups) { }
	global void setWarning(String warning) { }
	global String toString() { }

}