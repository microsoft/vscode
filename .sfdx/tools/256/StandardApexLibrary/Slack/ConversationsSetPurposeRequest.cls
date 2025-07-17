global class ConversationsSetPurposeRequest {
	global static Slack.ConversationsSetPurposeRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getPurpose() { }
	global String toString() { }
global class Builder {
	global ConversationsSetPurposeRequest.Builder() { }
	global Slack.ConversationsSetPurposeRequest build() { }
	global Slack.ConversationsSetPurposeRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsSetPurposeRequest.Builder purpose(String purpose) { }

}

}