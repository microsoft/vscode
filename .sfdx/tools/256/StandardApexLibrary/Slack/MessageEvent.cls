global class MessageEvent {
	global MessageEvent() { }
	global Object clone() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getChannel() { }
	global String getChannelType() { }
	global String getClientMsgId() { }
	global Slack.MessageEvent.Edited getEdited() { }
	global String getEventTs() { }
	global List<Slack.File> getFiles() { }
	global String getParentUserId() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setChannel(String channel) { }
	global void setChannelType(String channelType) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setEdited(Slack.MessageEvent.Edited edited) { }
	global void setEventTs(String eventTs) { }
	global void setFiles(List<Slack.File> files) { }
	global void setParentUserId(String parentUserId) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setUser(String user) { }
	global String toString() { }
global class Edited {
	global MessageEvent.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}

}