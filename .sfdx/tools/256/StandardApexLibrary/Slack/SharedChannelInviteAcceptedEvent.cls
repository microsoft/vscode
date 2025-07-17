global class SharedChannelInviteAcceptedEvent {
	global SharedChannelInviteAcceptedEvent() { }
	global Object clone() { }
	global Slack.ConnectUser getAcceptingUser() { }
	global Slack.ConnectChannel getChannel() { }
	global String getEventTs() { }
	global Slack.ConnectInviteDetail getInvite() { }
	global String getSubtype() { }
	global List<Slack.ConnectTeam> getTeamsInChannel() { }
	global String getType() { }
	global Boolean isApprovalRequired() { }
	global void setAcceptingUser(Slack.ConnectUser acceptingUser) { }
	global void setApprovalRequired(Boolean approvalRequired) { }
	global void setChannel(Slack.ConnectChannel channel) { }
	global void setEventTs(String eventTs) { }
	global void setInvite(Slack.ConnectInviteDetail invite) { }
	global void setTeamsInChannel(List<Slack.ConnectTeam> teamsInChannel) { }
	global String toString() { }

}