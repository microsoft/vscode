global class ChatUpdateRequest {
	global static Slack.ChatUpdateRequest.Builder builder() { }
	global Object clone() { }
	global String getAttachmentsAsString() { }
	global String getChannel() { }
	global String getParse() { }
	global String getText() { }
	global String getTs() { }
	global Boolean isLinkNames() { }
	global String toString() { }
global class Builder {
	global ChatUpdateRequest.Builder() { }
	global Slack.ChatUpdateRequest.Builder attachmentsAsString(String attachmentsAsString) { }
	global Slack.ChatUpdateRequest build() { }
	global Slack.ChatUpdateRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatUpdateRequest.Builder linkNames(Boolean linkNames) { }
	global Slack.ChatUpdateRequest.Builder parse(String parse) { }
	global Slack.ChatUpdateRequest.Builder text(String text) { }
	global Slack.ChatUpdateRequest.Builder ts(String ts) { }
	global Slack.ChatUpdateRequest.Builder viewReference(Slack.ViewReference viewReference) { }

}

}