global class ChatDeleteScheduledMessageRequest {
	global static Slack.ChatDeleteScheduledMessageRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getScheduledMessageId() { }
	global String toString() { }
global class Builder {
	global ChatDeleteScheduledMessageRequest.Builder() { }
	global Slack.ChatDeleteScheduledMessageRequest build() { }
	global Slack.ChatDeleteScheduledMessageRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatDeleteScheduledMessageRequest.Builder scheduledMessageId(String scheduledMessageId) { }

}

}