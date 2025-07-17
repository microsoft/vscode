global class ChatGetPermalinkRequest {
	global static Slack.ChatGetPermalinkRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getMessageTs() { }
	global String toString() { }
global class Builder {
	global ChatGetPermalinkRequest.Builder() { }
	global Slack.ChatGetPermalinkRequest build() { }
	global Slack.ChatGetPermalinkRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatGetPermalinkRequest.Builder messageTs(String messageTs) { }

}

}