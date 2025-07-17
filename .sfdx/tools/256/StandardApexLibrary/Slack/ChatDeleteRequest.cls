global class ChatDeleteRequest {
	global static Slack.ChatDeleteRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getTs() { }
	global String toString() { }
global class Builder {
	global ChatDeleteRequest.Builder() { }
	global Slack.ChatDeleteRequest build() { }
	global Slack.ChatDeleteRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatDeleteRequest.Builder ts(String ts) { }

}

}