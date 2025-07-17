global class SharedChannelInviteDeclinedEvent {
	global SharedChannelInviteDeclinedEvent() { }
	global Object clone() { }
	global Slack.ConnectChannel getChannel() { }
	global String getDecliningTeamId() { }
	global Slack.ConnectUser getDecliningUser() { }
	global String getEventTs() { }
	global Slack.ConnectInviteDetail getInvite() { }
	global String getSubtype() { }
	global List<Slack.ConnectTeam> getTeamsInChannel() { }
	global String getType() { }
	global void setChannel(Slack.ConnectChannel channel) { }
	global void setDecliningTeamId(String decliningTeamId) { }
	global void setDecliningUser(Slack.ConnectUser decliningUser) { }
	global void setEventTs(String eventTs) { }
	global void setInvite(Slack.ConnectInviteDetail invite) { }
	global void setTeamsInChannel(List<Slack.ConnectTeam> teamsInChannel) { }
	global String toString() { }

}