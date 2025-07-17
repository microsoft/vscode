global class ConversationsCreateRequest {
	global static Slack.ConversationsCreateRequest.Builder builder() { }
	global Object clone() { }
	global String getName() { }
	global String getTeamId() { }
	global Boolean isPrivate() { }
	global String toString() { }
global class Builder {
	global ConversationsCreateRequest.Builder() { }
	global Slack.ConversationsCreateRequest build() { }
	global Object clone() { }
	global Slack.ConversationsCreateRequest.Builder isPrivate(Boolean isPrivate) { }
	global Slack.ConversationsCreateRequest.Builder name(String name) { }
	global Slack.ConversationsCreateRequest.Builder teamId(String teamId) { }

}

}