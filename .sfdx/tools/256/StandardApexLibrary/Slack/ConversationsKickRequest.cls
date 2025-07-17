global class ConversationsKickRequest {
	global static Slack.ConversationsKickRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getUser() { }
	global String toString() { }
global class Builder {
	global ConversationsKickRequest.Builder() { }
	global Slack.ConversationsKickRequest build() { }
	global Slack.ConversationsKickRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsKickRequest.Builder user(String user) { }

}

}