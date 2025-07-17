global class ConversationsInfoRequest {
	global static Slack.ConversationsInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global Boolean isIncludeLocale() { }
	global Boolean isIncludeNumMembers() { }
	global String toString() { }
global class Builder {
	global ConversationsInfoRequest.Builder() { }
	global Slack.ConversationsInfoRequest build() { }
	global Slack.ConversationsInfoRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsInfoRequest.Builder includeLocale(Boolean includeLocale) { }
	global Slack.ConversationsInfoRequest.Builder includeNumMembers(Boolean includeNumMembers) { }

}

}