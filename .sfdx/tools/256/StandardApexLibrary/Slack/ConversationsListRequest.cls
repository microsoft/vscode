global class ConversationsListRequest {
	global static Slack.ConversationsListRequest.Builder builder() { }
	global Object clone() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global String getTeamId() { }
	global Boolean isExcludeArchived() { }
	global String toString() { }
global class Builder {
	global ConversationsListRequest.Builder() { }
	global Slack.ConversationsListRequest build() { }
	global Object clone() { }
	global Slack.ConversationsListRequest.Builder cursor(String cursor) { }
	global Slack.ConversationsListRequest.Builder excludeArchived(Boolean excludeArchived) { }
	global Slack.ConversationsListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.ConversationsListRequest.Builder teamId(String teamId) { }
	global Slack.ConversationsListRequest.Builder types(List<Slack.ConversationType> types) { }

}

}