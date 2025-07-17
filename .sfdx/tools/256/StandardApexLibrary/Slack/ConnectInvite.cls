global class ConnectInvite {
	global ConnectInvite() { }
	global Object clone() { }
	global List<Slack.ConnectInviteAcceptance> getAcceptances() { }
	global Slack.ConnectChannel getChannel() { }
	global Integer getDateLastUpdated() { }
	global String getDirection() { }
	global Slack.ConnectInviteDetail getInvite() { }
	global String getInviteType() { }
	global String getStatus() { }
	global void setAcceptances(List<Slack.ConnectInviteAcceptance> acceptances) { }
	global void setChannel(Slack.ConnectChannel channel) { }
	global void setDateLastUpdated(Integer dateLastUpdated) { }
	global void setDirection(String direction) { }
	global void setInvite(Slack.ConnectInviteDetail invite) { }
	global void setInviteType(String inviteType) { }
	global void setStatus(String status) { }
	global String toString() { }

}