global class ConversationsJoinRequest {
	global static Slack.ConversationsJoinRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String toString() { }
global class Builder {
	global ConversationsJoinRequest.Builder() { }
	global Slack.ConversationsJoinRequest build() { }
	global Slack.ConversationsJoinRequest.Builder channel(String channel) { }
	global Object clone() { }

}

}