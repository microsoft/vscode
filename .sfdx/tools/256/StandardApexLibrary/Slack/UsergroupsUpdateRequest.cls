global class UsergroupsUpdateRequest {
	global static Slack.UsergroupsUpdateRequest.Builder builder() { }
	global Object clone() { }
	global List<String> getChannels() { }
	global String getDescription() { }
	global String getHandle() { }
	global String getName() { }
	global String getTeamId() { }
	global String getUsergroup() { }
	global Boolean isIncludeCount() { }
	global String toString() { }
global class Builder {
	global UsergroupsUpdateRequest.Builder() { }
	global Slack.UsergroupsUpdateRequest build() { }
	global Slack.UsergroupsUpdateRequest.Builder channels(List<String> channels) { }
	global Object clone() { }
	global Slack.UsergroupsUpdateRequest.Builder description(String description) { }
	global Slack.UsergroupsUpdateRequest.Builder handle(String handle) { }
	global Slack.UsergroupsUpdateRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsUpdateRequest.Builder name(String name) { }
	global Slack.UsergroupsUpdateRequest.Builder teamId(String teamId) { }
	global Slack.UsergroupsUpdateRequest.Builder usergroup(String usergroup) { }

}

}