global class ConversationsInviteRequest {
	global static Slack.ConversationsInviteRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global List<String> getUsers() { }
	global String toString() { }
global class Builder {
	global ConversationsInviteRequest.Builder() { }
	global Slack.ConversationsInviteRequest build() { }
	global Slack.ConversationsInviteRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsInviteRequest.Builder users(List<String> users) { }

}

}