global class UsergroupsCreateRequest {
	global static Slack.UsergroupsCreateRequest.Builder builder() { }
	global Object clone() { }
	global List<String> getChannels() { }
	global String getDescription() { }
	global String getHandle() { }
	global String getName() { }
	global String getTeamId() { }
	global Boolean isIncludeCount() { }
	global String toString() { }
global class Builder {
	global UsergroupsCreateRequest.Builder() { }
	global Slack.UsergroupsCreateRequest build() { }
	global Slack.UsergroupsCreateRequest.Builder channels(List<String> channels) { }
	global Object clone() { }
	global Slack.UsergroupsCreateRequest.Builder description(String description) { }
	global Slack.UsergroupsCreateRequest.Builder handle(String handle) { }
	global Slack.UsergroupsCreateRequest.Builder includeCount(Boolean includeCount) { }
	global Slack.UsergroupsCreateRequest.Builder name(String name) { }
	global Slack.UsergroupsCreateRequest.Builder teamId(String teamId) { }

}

}