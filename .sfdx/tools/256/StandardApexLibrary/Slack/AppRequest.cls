global class AppRequest {
	global AppRequest() { }
	global Object clone() { }
	global Slack.RequestedApp getApp() { }
	global Integer getDateCreated() { }
	global String getId() { }
	global Boolean getIsUserAppCollaborator() { }
	global String getMessage() { }
	global Slack.AppRequest.PreviousResolution getPreviousResolution() { }
	global List<Slack.AppScope> getScopes() { }
	global Slack.AppRequest.Team getTeam() { }
	global Slack.AppRequest.User getUser() { }
	global void setApp(Slack.RequestedApp app) { }
	global void setDateCreated(Integer dateCreated) { }
	global void setId(String id) { }
	global void setIsUserAppCollaborator(Boolean isUserAppCollaborator) { }
	global void setMessage(String message) { }
	global void setPreviousResolution(Slack.AppRequest.PreviousResolution previousResolution) { }
	global void setScopes(List<Slack.AppScope> scopes) { }
	global void setTeam(Slack.AppRequest.Team team) { }
	global void setUser(Slack.AppRequest.User user) { }
	global String toString() { }
global class PreviousResolution {
	global AppRequest.PreviousResolution() { }
	global Object clone() { }
	global List<Slack.AppScope> getScopes() { }
	global String getStatus() { }
	global void setScopes(List<Slack.AppScope> scopes) { }
	global void setStatus(String status) { }

}
global class Team {
	global AppRequest.Team() { }
	global Object clone() { }
	global String getDomain() { }
	global String getId() { }
	global String getName() { }
	global void setDomain(String domain) { }
	global void setId(String id) { }
	global void setName(String name) { }

}
global class User {
	global AppRequest.User() { }
	global Object clone() { }
	global String getEmail() { }
	global String getId() { }
	global String getName() { }
	global void setEmail(String email) { }
	global void setId(String id) { }
	global void setName(String name) { }

}

}