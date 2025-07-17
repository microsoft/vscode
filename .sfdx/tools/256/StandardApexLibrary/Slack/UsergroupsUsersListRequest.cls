global class UsergroupsUsersListRequest {
	global static Slack.UsergroupsUsersListRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUsergroup() { }
	global Boolean isIncludeDisabled() { }
	global String toString() { }
global class Builder {
	global UsergroupsUsersListRequest.Builder() { }
	global Slack.UsergroupsUsersListRequest build() { }
	global Object clone() { }
	global Slack.UsergroupsUsersListRequest.Builder includeDisabled(Boolean includeDisabled) { }
	global Slack.UsergroupsUsersListRequest.Builder teamId(String teamId) { }
	global Slack.UsergroupsUsersListRequest.Builder usergroup(String usergroup) { }

}

}