global class ChatScheduledMessagesListRequest {
	global static Slack.ChatScheduledMessagesListRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getCursor() { }
	global String getLatest() { }
	global Integer getLimit() { }
	global String getOldest() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global ChatScheduledMessagesListRequest.Builder() { }
	global Slack.ChatScheduledMessagesListRequest build() { }
	global Slack.ChatScheduledMessagesListRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ChatScheduledMessagesListRequest.Builder cursor(String cursor) { }
	global Slack.ChatScheduledMessagesListRequest.Builder latest(String latest) { }
	global Slack.ChatScheduledMessagesListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.ChatScheduledMessagesListRequest.Builder oldest(String oldest) { }
	global Slack.ChatScheduledMessagesListRequest.Builder teamId(String teamId) { }

}

}