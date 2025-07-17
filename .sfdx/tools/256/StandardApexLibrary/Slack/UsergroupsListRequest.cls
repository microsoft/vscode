global class UsergroupsListRequest {
	global static Slack.UsergroupsListRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global Boolean isIncludeCount() { }
	global Boolean isIncludeDisabled() { }
	global Boolean isIncludeUsers() { }
	global String toString() { }
global class Builder {
	global UsergroupsListRequest.Builder() { }
	global Slack.UsergroupsListRequest build() { }
	global Object clone() { }
	global Slack.UsergroupsListRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsListRequest.Builder includeDisabled(Boolean includeDisabled) { }
	global Slack.UsergroupsListRequest.Builder includeUsers(Boolean includeUsers) { }
	global Slack.UsergroupsListRequest.Builder teamId(String teamId) { }

}

}