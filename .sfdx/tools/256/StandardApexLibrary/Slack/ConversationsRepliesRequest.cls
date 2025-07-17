global class ConversationsRepliesRequest {
	global static Slack.ConversationsRepliesRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getCursor() { }
	global String getLatest() { }
	global Integer getLimit() { }
	global String getOldest() { }
	global String getTs() { }
	global Boolean isIncludeAllMetadata() { }
	global Boolean isInclusive() { }
	global String toString() { }
global class Builder {
	global ConversationsRepliesRequest.Builder() { }
	global Slack.ConversationsRepliesRequest build() { }
	global Slack.ConversationsRepliesRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsRepliesRequest.Builder cursor(String cursor) { }
	global Slack.ConversationsRepliesRequest.Builder includeAllMetadata(Boolean includeAllMetadata) { }
	global Slack.ConversationsRepliesRequest.Builder inclusive(Boolean inclusive) { }
	global Slack.ConversationsRepliesRequest.Builder latest(String latest) { }
	global Slack.ConversationsRepliesRequest.Builder limitValue(Integer limitValue) { }
	global Slack.ConversationsRepliesRequest.Builder oldest(String oldest) { }
	global Slack.ConversationsRepliesRequest.Builder ts(String ts) { }

}

}