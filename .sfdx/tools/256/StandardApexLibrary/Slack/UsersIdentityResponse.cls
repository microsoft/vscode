global class UsersIdentityResponse {
	global UsersIdentityResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.UsersIdentityResponse.Team getTeam() { }
	global Slack.UsersIdentityResponse.User getUser() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setTeam(Slack.UsersIdentityResponse.Team team) { }
	global void setUser(Slack.UsersIdentityResponse.User user) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Team {
	global UsersIdentityResponse.Team() { }
	global Object clone() { }
	global String getId() { }
	global String getName() { }
	global void setId(String id) { }
	global void setName(String name) { }

}
global class User {
	global UsersIdentityResponse.User() { }
	global Object clone() { }
	global String getEmail() { }
	global String getId() { }
	global String getImage192() { }
	global String getImage24() { }
	global String getImage32() { }
	global String getImage48() { }
	global String getImage512() { }
	global String getImage72() { }
	global String getName() { }
	global void setEmail(String email) { }
	global void setId(String id) { }
	global void setImage192(String image192) { }
	global void setImage24(String image24) { }
	global void setImage32(String image32) { }
	global void setImage48(String image48) { }
	global void setImage512(String image512) { }
	global void setImage72(String image72) { }
	global void setName(String name) { }

}

}