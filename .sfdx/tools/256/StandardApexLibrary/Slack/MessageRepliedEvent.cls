global class MessageRepliedEvent {
	global MessageRepliedEvent() { }
	global Object clone() { }
	global String getChannel() { }
	global String getEventTs() { }
	global Slack.MessageRepliedEvent.Message getMessage() { }
	global String getSubtype() { }
	global String getTs() { }
	global String getType() { }
	global Boolean isHidden() { }
	global void setChannel(String channel) { }
	global void setEventTs(String eventTs) { }
	global void setHidden(Boolean hidden) { }
	global void setMessage(Slack.MessageRepliedEvent.Message message) { }
	global void setTs(String ts) { }
	global String toString() { }
global class Edited {
	global MessageRepliedEvent.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Message {
	global MessageRepliedEvent.Message() { }
	global Object clone() { }
	global String getClientMsgId() { }
	global List<String> getPinnedTo() { }
	global List<Slack.Reaction> getReactions() { }
	global String getSourceTeam() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global String getUserTeam() { }
	global Boolean isStarred() { }
	global void setClientMsgId(String clientMsgId) { }
	global void setPinnedTo(List<String> pinnedTo) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setSourceTeam(String sourceTeam) { }
	global void setStarred(Boolean starred) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setUser(String user) { }
	global void setUserTeam(String userTeam) { }

}

}