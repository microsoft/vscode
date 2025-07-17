global class ChannelCreatedEvent {
	global ChannelCreatedEvent() { }
	global Object clone() { }
	global Slack.ChannelCreatedEvent.Channel getChannel() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global String getType() { }
	global void setChannel(Slack.ChannelCreatedEvent.Channel channel) { }
	global void setEventTs(String eventTs) { }
	global String toString() { }
global class Channel {
	global ChannelCreatedEvent.Channel() { }
	global Object clone() { }
	global String getContextTeamId() { }
	global Integer getCreated() { }
	global String getCreator() { }
	global String getId() { }
	global String getName() { }
	global String getNameNormalized() { }
	global Boolean isChannel() { }
	global Boolean isOrgShared() { }
	global Boolean isShared() { }
	global void setChannel(Boolean isChannel) { }
	global void setContextTeamId(String contextTeamId) { }
	global void setCreated(Integer created) { }
	global void setCreator(String creator) { }
	global void setId(String id) { }
	global void setName(String name) { }
	global void setNameNormalized(String nameNormalized) { }
	global void setOrgShared(Boolean isOrgShared) { }
	global void setShared(Boolean isShared) { }

}

}