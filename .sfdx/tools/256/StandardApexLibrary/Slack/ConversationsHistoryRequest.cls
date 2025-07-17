global class ConversationsHistoryRequest {
	global static Slack.ConversationsHistoryRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getCursor() { }
	global String getLatest() { }
	global Integer getLimit() { }
	global String getOldest() { }
	global Boolean isIncludeAllMetadata() { }
	global Boolean isInclusive() { }
	global String toString() { }
global class Builder {
	global ConversationsHistoryRequest.Builder() { }
	global Slack.ConversationsHistoryRequest build() { }
	global Slack.ConversationsHistoryRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsHistoryRequest.Builder cursor(String cursor) { }
	global Slack.ConversationsHistoryRequest.Builder includeAllMetadata(Boolean includeAllMetadata) { }
	global Slack.ConversationsHistoryRequest.Builder inclusive(Boolean inclusive) { }
	global Slack.ConversationsHistoryRequest.Builder latest(String latest) { }
	global Slack.ConversationsHistoryRequest.Builder limitValue(Integer limitValue) { }
	global Slack.ConversationsHistoryRequest.Builder oldest(String oldest) { }

}

}