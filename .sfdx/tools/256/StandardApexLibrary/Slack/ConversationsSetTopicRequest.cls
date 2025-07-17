global class ConversationsSetTopicRequest {
	global static Slack.ConversationsSetTopicRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getTopic() { }
	global String toString() { }
global class Builder {
	global ConversationsSetTopicRequest.Builder() { }
	global Slack.ConversationsSetTopicRequest build() { }
	global Slack.ConversationsSetTopicRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsSetTopicRequest.Builder topic(String topic) { }

}

}