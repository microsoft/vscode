global class ChatMeMessageRequest {
	global static Slack.ChatMeMessageRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getText() { }
	global String toString() { }
global class Builder {
	global ChatMeMessageRequest.Builder() { }
	global Slack.ChatMeMessageRequest build() { }
	global Slack.ChatMeMessageRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatMeMessageRequest.Builder text(String text) { }

}

}