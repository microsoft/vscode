global class ConversationsArchiveRequest {
	global static Slack.ConversationsArchiveRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String toString() { }
global class Builder {
	global ConversationsArchiveRequest.Builder() { }
	global Slack.ConversationsArchiveRequest build() { }
	global Slack.ConversationsArchiveRequest.Builder channel(String channel) { }
	global Object clone() { }

}

}