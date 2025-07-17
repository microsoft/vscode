global class MessageContext {
	global Object clone() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getUserId() { }
global class Builder {
	global MessageContext.Builder() { }
	global Slack.MessageContext build() { }
	global Object clone() { }
	global Slack.MessageContext.Builder text(String text) { }
	global Slack.MessageContext.Builder threadTs(String threadTs) { }
	global Slack.MessageContext.Builder ts(String ts) { }
	global Slack.MessageContext.Builder userId(String userId) { }

}

}