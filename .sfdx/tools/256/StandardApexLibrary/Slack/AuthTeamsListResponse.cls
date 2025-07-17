global class AuthTeamsListResponse {
	global AuthTeamsListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global List<Slack.AuthTeamsListResponse.Team> getTeams() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setTeams(List<Slack.AuthTeamsListResponse.Team> teams) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Team {
	global AuthTeamsListResponse.Team() { }
	global Object clone() { }
	global String getId() { }
	global String getName() { }
	global void setId(String id) { }
	global void setName(String name) { }

}

}