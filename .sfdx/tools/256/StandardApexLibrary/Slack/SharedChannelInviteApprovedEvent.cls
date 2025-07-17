global class SharedChannelInviteApprovedEvent {
	global SharedChannelInviteApprovedEvent() { }
	global Object clone() { }
	global String getApprovingTeamId() { }
	global Slack.ConnectUser getApprovingUser() { }
	global Slack.ConnectChannel getChannel() { }
	global String getEventTs() { }
	global Slack.ConnectInviteDetail getInvite() { }
	global String getSubtype() { }
	global List<Slack.ConnectTeam> getTeamsInChannel() { }
	global String getType() { }
	global void setApprovingTeamId(String approvingTeamId) { }
	global void setApprovingUser(Slack.ConnectUser approvingUser) { }
	global void setChannel(Slack.ConnectChannel channel) { }
	global void setEventTs(String eventTs) { }
	global void setInvite(Slack.ConnectInviteDetail invite) { }
	global void setTeamsInChannel(List<Slack.ConnectTeam> teamsInChannel) { }
	global String toString() { }

}