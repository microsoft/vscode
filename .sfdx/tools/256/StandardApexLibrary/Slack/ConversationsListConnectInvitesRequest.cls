global class ConversationsListConnectInvitesRequest {
	global static Slack.ConversationsListConnectInvitesRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global String getCursor() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global ConversationsListConnectInvitesRequest.Builder() { }
	global Slack.ConversationsListConnectInvitesRequest build() { }
	global Object clone() { }
	global Slack.ConversationsListConnectInvitesRequest.Builder count(Integer count) { }
	global Slack.ConversationsListConnectInvitesRequest.Builder cursor(String cursor) { }
	global Slack.ConversationsListConnectInvitesRequest.Builder teamId(String teamId) { }

}

}