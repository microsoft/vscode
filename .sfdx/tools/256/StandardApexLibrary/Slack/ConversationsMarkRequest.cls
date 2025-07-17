global class ConversationsMarkRequest {
	global static Slack.ConversationsMarkRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getTs() { }
	global String toString() { }
global class Builder {
	global ConversationsMarkRequest.Builder() { }
	global Slack.ConversationsMarkRequest build() { }
	global Slack.ConversationsMarkRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsMarkRequest.Builder ts(String ts) { }

}

}