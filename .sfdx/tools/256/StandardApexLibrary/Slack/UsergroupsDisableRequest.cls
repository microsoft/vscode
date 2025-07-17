global class UsergroupsDisableRequest {
	global static Slack.UsergroupsDisableRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUsergroup() { }
	global Boolean isIncludeCount() { }
	global String toString() { }
global class Builder {
	global UsergroupsDisableRequest.Builder() { }
	global Slack.UsergroupsDisableRequest build() { }
	global Object clone() { }
	global Slack.UsergroupsDisableRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsDisableRequest.Builder teamId(String teamId) { }
	global Slack.UsergroupsDisableRequest.Builder usergroup(String usergroup) { }

}

}