global class ConversationsAcceptSharedInviteRequest {
	global static Slack.ConversationsAcceptSharedInviteRequest.Builder builder() { }
	global Object clone() { }
	global String getChannelId() { }
	global String getChannelName() { }
	global Boolean getFreeTrialAccept() { }
	global String getInviteId() { }
	global Boolean getIsPrivate() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global ConversationsAcceptSharedInviteRequest.Builder() { }
	global Slack.ConversationsAcceptSharedInviteRequest build() { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder channelId(String channelId) { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder channelName(String channelName) { }
	global Object clone() { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder freeTrialAccept(Boolean freeTrialAccept) { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder inviteId(String inviteId) { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder isPrivate(Boolean isPrivate) { }
	global Slack.ConversationsAcceptSharedInviteRequest.Builder teamId(String teamId) { }

}

}