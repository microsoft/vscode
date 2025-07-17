global class ChatPostMessageRequest {
	global static Slack.ChatPostMessageRequest.Builder builder() { }
	global Object clone() { }
	global String getAttachmentsAsString() { }
	global String getChannel() { }
	global String getIconEmoji() { }
	global String getIconUrl() { }
	global String getParse() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getUsername() { }
	global Boolean isLinkNames() { }
	global Boolean isMrkdwn() { }
	global Boolean isReplyBroadcast() { }
	global Boolean isUnfurlLinks() { }
	global Boolean isUnfurlMedia() { }
	global String toString() { }
global class Builder {
	global ChatPostMessageRequest.Builder() { }
	global Slack.ChatPostMessageRequest.Builder attachmentsAsString(String attachmentsAsString) { }
	global Slack.ChatPostMessageRequest build() { }
	global Slack.ChatPostMessageRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatPostMessageRequest.Builder iconEmoji(String iconEmoji) { }
	global Slack.ChatPostMessageRequest.Builder iconUrl(String iconUrl) { }
	global Slack.ChatPostMessageRequest.Builder linkNames(Boolean linkNames) { }
	global Slack.ChatPostMessageRequest.Builder mrkdwn(Boolean mrkdwn) { }
	global Slack.ChatPostMessageRequest.Builder parse(String parse) { }
	global Slack.ChatPostMessageRequest.Builder replyBroadcast(Boolean replyBroadcast) { }
	global Slack.ChatPostMessageRequest.Builder text(String text) { }
	global Slack.ChatPostMessageRequest.Builder threadTs(String threadTs) { }
	global Slack.ChatPostMessageRequest.Builder unfurlLinks(Boolean unfurlLinks) { }
	global Slack.ChatPostMessageRequest.Builder unfurlMedia(Boolean unfurlMedia) { }
	global Slack.ChatPostMessageRequest.Builder username(String username) { }
	global Slack.ChatPostMessageRequest.Builder viewReference(Slack.ViewReference viewReference) { }

}

}