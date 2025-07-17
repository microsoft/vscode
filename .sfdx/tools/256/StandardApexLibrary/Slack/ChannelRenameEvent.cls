global class ChannelRenameEvent {
	global ChannelRenameEvent() { }
	global Object clone() { }
	global Slack.ChannelRenameEvent.Channel getChannel() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global String getType() { }
	global void setChannel(Slack.ChannelRenameEvent.Channel channel) { }
	global void setEventTs(String eventTs) { }
	global String toString() { }
global class Channel {
	global ChannelRenameEvent.Channel() { }
	global Object clone() { }
	global Integer getCreated() { }
	global String getId() { }
	global String getName() { }
	global String getNameNormalized() { }
	global Boolean isChannel() { }
	global Boolean isMpim() { }
	global void setChannel(Boolean isChannel) { }
	global void setCreated(Integer created) { }
	global void setId(String id) { }
	global void setMpim(Boolean isMpim) { }
	global void setName(String name) { }
	global void setNameNormalized(String nameNormalized) { }

}

}