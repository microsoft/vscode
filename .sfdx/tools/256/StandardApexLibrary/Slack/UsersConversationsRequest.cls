global class UsersConversationsRequest {
	global static Slack.UsersConversationsRequest.Builder builder() { }
	global Object clone() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global String getTeamId() { }
	global String getUser() { }
	global Boolean isExcludeArchived() { }
	global String toString() { }
global class Builder {
	global UsersConversationsRequest.Builder() { }
	global Slack.UsersConversationsRequest build() { }
	global Object clone() { }
	global Slack.UsersConversationsRequest.Builder cursor(String cursor) { }
	global Slack.UsersConversationsRequest.Builder excludeArchived(Boolean excludeArchived) { }
	global Slack.UsersConversationsRequest.Builder limitValue(Integer limitValue) { }
	global Slack.UsersConversationsRequest.Builder teamId(String teamId) { }
	global Slack.UsersConversationsRequest.Builder types(List<Slack.ConversationType> types) { }
	global Slack.UsersConversationsRequest.Builder user(String user) { }

}

}