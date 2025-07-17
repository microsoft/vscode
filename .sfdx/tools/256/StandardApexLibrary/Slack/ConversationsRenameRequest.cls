global class ConversationsRenameRequest {
	global static Slack.ConversationsRenameRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getName() { }
	global String toString() { }
global class Builder {
	global ConversationsRenameRequest.Builder() { }
	global Slack.ConversationsRenameRequest build() { }
	global Slack.ConversationsRenameRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsRenameRequest.Builder name(String name) { }

}

}