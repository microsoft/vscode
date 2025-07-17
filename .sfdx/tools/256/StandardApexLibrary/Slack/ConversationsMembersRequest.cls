global class ConversationsMembersRequest {
	global static Slack.ConversationsMembersRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global String toString() { }
global class Builder {
	global ConversationsMembersRequest.Builder() { }
	global Slack.ConversationsMembersRequest build() { }
	global Slack.ConversationsMembersRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsMembersRequest.Builder cursor(String cursor) { }
	global Slack.ConversationsMembersRequest.Builder limitValue(Integer limitValue) { }

}

}