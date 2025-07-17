global class ChatPostEphemeralRequest {
	global static Slack.ChatPostEphemeralRequest.Builder builder() { }
	global Object clone() { }
	global String getAttachmentsAsString() { }
	global String getChannel() { }
	global String getIconEmoji() { }
	global String getIconUrl() { }
	global String getParse() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getUser() { }
	global String getUsername() { }
	global Boolean isLinkNames() { }
	global String toString() { }
global class Builder {
	global ChatPostEphemeralRequest.Builder() { }
	global Slack.ChatPostEphemeralRequest.Builder attachmentsAsString(String attachmentsAsString) { }
	global Slack.ChatPostEphemeralRequest build() { }
	global Slack.ChatPostEphemeralRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatPostEphemeralRequest.Builder iconEmoji(String iconEmoji) { }
	global Slack.ChatPostEphemeralRequest.Builder iconUrl(String iconUrl) { }
	global Slack.ChatPostEphemeralRequest.Builder linkNames(Boolean linkNames) { }
	global Slack.ChatPostEphemeralRequest.Builder parse(String parse) { }
	global Slack.ChatPostEphemeralRequest.Builder text(String text) { }
	global Slack.ChatPostEphemeralRequest.Builder threadTs(String threadTs) { }
	global Slack.ChatPostEphemeralRequest.Builder user(String user) { }
	global Slack.ChatPostEphemeralRequest.Builder username(String username) { }
	global Slack.ChatPostEphemeralRequest.Builder viewReference(Slack.ViewReference viewReference) { }

}

}