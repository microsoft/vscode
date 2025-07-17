global class UsersListRequest {
	global static Slack.UsersListRequest.Builder builder() { }
	global Object clone() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global String getTeamId() { }
	global Boolean isIncludeLocale() { }
	global String toString() { }
global class Builder {
	global UsersListRequest.Builder() { }
	global Slack.UsersListRequest build() { }
	global Object clone() { }
	global Slack.UsersListRequest.Builder cursor(String cursor) { }
	global Slack.UsersListRequest.Builder includeLocale(Boolean includeLocale) { }
	global Slack.UsersListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.UsersListRequest.Builder teamId(String teamId) { }

}

}