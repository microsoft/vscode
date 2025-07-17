global class PinAddedEvent {
	global PinAddedEvent() { }
	global Object clone() { }
	global String getChannelId() { }
	global String getEventTs() { }
	global Slack.PinAddedEvent.Item getItem() { }
	global String getItemUser() { }
	global Integer getPinCount() { }
	global Slack.PinAddedEvent.PinnedInfo getPinnedInfo() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setChannelId(String channelId) { }
	global void setEventTs(String eventTs) { }
	global void setItem(Slack.PinAddedEvent.Item item) { }
	global void setItemUser(String itemUser) { }
	global void setPinCount(Integer pinCount) { }
	global void setPinnedInfo(Slack.PinAddedEvent.PinnedInfo pinnedInfo) { }
	global void setUser(String user) { }
	global String toString() { }
global class Item {
	global PinAddedEvent.Item() { }
	global Object clone() { }
	global String getChannel() { }
	global Slack.FileComment getComment() { }
	global Integer getCreated() { }
	global String getCreatedBy() { }
	global Slack.File getFile() { }
	global Slack.PinAddedEvent.Message getMessage() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setComment(Slack.FileComment comment) { }
	global void setCreated(Integer created) { }
	global void setCreatedBy(String createdBy) { }
	global void setFile(Slack.File file) { }
	global void setMessage(Slack.PinAddedEvent.Message message) { }
	global void setType(String type) { }

}
global class Message {
	global PinAddedEvent.Message() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global String getPermalink() { }
	global List<String> getPinnedTo() { }
	global String getTeam() { }
	global String getText() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global void setAppId(String appId) { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setPermalink(String permalink) { }
	global void setPinnedTo(List<String> pinnedTo) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUser(String user) { }

}
global class PinnedInfo {
	global PinAddedEvent.PinnedInfo() { }
	global Object clone() { }
	global String getChannel() { }
	global String getPinnedBy() { }
	global Long getPinnedTs() { }
	global void setChannel(String channel) { }
	global void setPinnedBy(String pinnedBy) { }
	global void setPinnedTs(Long pinnedTs) { }

}

}