global class UsergroupsUsersUpdateRequest {
	global static Slack.UsergroupsUsersUpdateRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUsergroup() { }
	global List<String> getUsers() { }
	global Boolean isIncludeCount() { }
	global String toString() { }
global class Builder {
	global UsergroupsUsersUpdateRequest.Builder() { }
	global Slack.UsergroupsUsersUpdateRequest build() { }
	global Object clone() { }
	global Slack.UsergroupsUsersUpdateRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsUsersUpdateRequest.Builder teamId(String teamId) { }
	global Slack.UsergroupsUsersUpdateRequest.Builder usergroup(String usergroup) { }
	global Slack.UsergroupsUsersUpdateRequest.Builder users(List<String> users) { }

}

}