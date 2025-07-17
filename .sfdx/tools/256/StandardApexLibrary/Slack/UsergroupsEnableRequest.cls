global class UsergroupsEnableRequest {
	global static Slack.UsergroupsEnableRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUsergroup() { }
	global Boolean isIncludeCount() { }
	global String toString() { }
global class Builder {
	global UsergroupsEnableRequest.Builder() { }
	global Slack.UsergroupsEnableRequest build() { }
	global Object clone() { }
	global Slack.UsergroupsEnableRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsEnableRequest.Builder teamId(String teamId) { }
	global Slack.UsergroupsEnableRequest.Builder usergroup(String usergroup) { }

}

}