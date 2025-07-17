global class ConversationsDeclineSharedInviteRequest {
	global static Slack.ConversationsDeclineSharedInviteRequest.Builder builder() { }
	global Object clone() { }
	global String getInviteId() { }
	global String getTargetTeam() { }
	global String toString() { }
global class Builder {
	global ConversationsDeclineSharedInviteRequest.Builder() { }
	global Slack.ConversationsDeclineSharedInviteRequest build() { }
	global Object clone() { }
	global Slack.ConversationsDeclineSharedInviteRequest.Builder inviteId(String inviteId) { }
	global Slack.ConversationsDeclineSharedInviteRequest.Builder targetTeam(String targetTeam) { }

}

}