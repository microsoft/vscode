global class UsersListResponse {
	global UsersListResponse() { }
	global Object clone() { }
	global String getCacheTs() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.User> getMembers() { }
	global String getNeeded() { }
	global String getOffset() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setCacheTs(String cacheTs) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMembers(List<Slack.User> members) { }
	global void setNeeded(String needed) { }
	global void setOffset(String offset) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}