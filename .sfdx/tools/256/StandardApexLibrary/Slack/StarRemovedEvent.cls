global class StarRemovedEvent {
	global StarRemovedEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global Slack.StarRemovedEvent.Item getItem() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setEventTs(String eventTs) { }
	global void setItem(Slack.StarRemovedEvent.Item item) { }
	global void setUser(String user) { }
	global String toString() { }
global class Edited {
	global StarRemovedEvent.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Item {
	global StarRemovedEvent.Item() { }
	global Object clone() { }
	global String getChannel() { }
	global Slack.FileComment getComment() { }
	global String getCreatedBy() { }
	global Long getDateCreate() { }
	global Slack.File getFile() { }
	global Slack.StarRemovedEvent.Message getMessage() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setComment(Slack.FileComment comment) { }
	global void setCreatedBy(String createdBy) { }
	global void setDateCreate(Long dateCreate) { }
	global void setFile(Slack.File file) { }
	global void setMessage(Slack.StarRemovedEvent.Message message) { }
	global void setType(String type) { }

}
global class Message {
	global StarRemovedEvent.Message() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global Slack.StarRemovedEvent.Edited getEdited() { }
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
	global void setEdited(Slack.StarRemovedEvent.Edited edited) { }
	global void setPermalink(String permalink) { }
	global void setPinnedTo(List<String> pinnedTo) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUser(String user) { }

}

}