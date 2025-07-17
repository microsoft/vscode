global class SharedChannelInviteReceivedEvent {
	global SharedChannelInviteReceivedEvent() { }
	global Object clone() { }
	global Slack.ConnectChannel getChannel() { }
	global String getEventTs() { }
	global Slack.ConnectInviteDetail getInvite() { }
	global String getSubtype() { }
	global String getType() { }
	global void setChannel(Slack.ConnectChannel channel) { }
	global void setEventTs(String eventTs) { }
	global void setInvite(Slack.ConnectInviteDetail invite) { }
	global String toString() { }

}