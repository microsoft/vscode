global class ImCreatedEvent {
	global ImCreatedEvent() { }
	global Object clone() { }
	global Slack.ImCreatedEvent.Channel getChannel() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setChannel(Slack.ImCreatedEvent.Channel channel) { }
	global void setUser(String user) { }
	global String toString() { }
global class Channel {
	global ImCreatedEvent.Channel() { }
	global Object clone() { }

}

}