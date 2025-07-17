global class AppMentionEvent {
	global AppMentionEvent() { }
	global Object clone() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getChannel() { }
	global String getClientMsgId() { }
	global Slack.AppMentionEvent.Edited getEdited() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global String getUsername() { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setChannel(String channel) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setEdited(Slack.AppMentionEvent.Edited edited) { }
	global void setEventTs(String eventTs) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }
	global String toString() { }
global class Edited {
	global AppMentionEvent.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}

}