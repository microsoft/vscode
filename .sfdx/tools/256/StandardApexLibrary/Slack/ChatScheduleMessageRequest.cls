global class ChatScheduleMessageRequest {
	global static Slack.ChatScheduleMessageRequest.Builder builder() { }
	global Object clone() { }
	global String getAttachmentsAsString() { }
	global String getChannel() { }
	global String getParse() { }
	global Integer getPostAt() { }
	global String getText() { }
	global String getThreadTs() { }
	global Boolean isLinkNames() { }
	global Boolean isReplyBroadcast() { }
	global Boolean isUnfurlLinks() { }
	global Boolean isUnfurlMedia() { }
	global String toString() { }
global class Builder {
	global ChatScheduleMessageRequest.Builder() { }
	global Slack.ChatScheduleMessageRequest.Builder attachmentsAsString(String attachmentsAsString) { }
	global Slack.ChatScheduleMessageRequest build() { }
	global Slack.ChatScheduleMessageRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatScheduleMessageRequest.Builder linkNames(Boolean linkNames) { }
	global Slack.ChatScheduleMessageRequest.Builder parse(String parse) { }
	global Slack.ChatScheduleMessageRequest.Builder postAt(Integer postAt) { }
	global Slack.ChatScheduleMessageRequest.Builder replyBroadcast(Boolean replyBroadcast) { }
	global Slack.ChatScheduleMessageRequest.Builder text(String text) { }
	global Slack.ChatScheduleMessageRequest.Builder threadTs(String threadTs) { }
	global Slack.ChatScheduleMessageRequest.Builder unfurlLinks(Boolean unfurlLinks) { }
	global Slack.ChatScheduleMessageRequest.Builder unfurlMedia(Boolean unfurlMedia) { }
	global Slack.ChatScheduleMessageRequest.Builder viewReference(Slack.ViewReference viewReference) { }

}

}