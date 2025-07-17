global class MessageChangedEvent {
	global MessageChangedEvent() { }
	global Object clone() { }
	global String getChannel() { }
	global String getChannelType() { }
	global String getEventTs() { }
	global Slack.MessageChangedEvent.Message getMessage() { }
	global Slack.MessageChangedEvent.PreviousMessage getPreviousMessage() { }
	global String getSubtype() { }
	global String getTs() { }
	global String getType() { }
	global Boolean isHidden() { }
	global void setChannel(String channel) { }
	global void setChannelType(String channelType) { }
	global void setEventTs(String eventTs) { }
	global void setHidden(Boolean hidden) { }
	global void setMessage(Slack.MessageChangedEvent.Message message) { }
	global void setPreviousMessage(Slack.MessageChangedEvent.PreviousMessage previousMessage) { }
	global void setTs(String ts) { }
	global String toString() { }
global class Edited {
	global MessageChangedEvent.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Message {
	global MessageChangedEvent.Message() { }
	global Object clone() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global Boolean getDisplayAsBot() { }
	global List<Slack.File> getFiles() { }
	global Boolean getHidden() { }
	global Boolean getIsLocked() { }
	global String getLastRead() { }
	global String getLatestReply() { }
	global String getParentUserId() { }
	global List<String> getPinnedTo() { }
	global List<Slack.Reaction> getReactions() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global String getSourceTeam() { }
	global Boolean getSubscribed() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global Boolean getUpload() { }
	global String getUser() { }
	global String getUserTeam() { }
	global List<String> getXFiles() { }
	global Boolean isStarred() { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setFiles(List<Slack.File> files) { }
	global void setHidden(Boolean hidden) { }
	global void setIsLocked(Boolean isLocked) { }
	global void setLastRead(String lastRead) { }
	global void setLatestReply(String latestReply) { }
	global void setParentUserId(String parentUserId) { }
	global void setPinnedTo(List<String> pinnedTo) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setSourceTeam(String sourceTeam) { }
	global void setStarred(Boolean starred) { }
	global void setSubscribed(Boolean subscribed) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setUpload(Boolean upload) { }
	global void setUser(String user) { }
	global void setUserTeam(String userTeam) { }
	global void setXFiles(List<String> xFiles) { }

}
global class PreviousMessage {
	global MessageChangedEvent.PreviousMessage() { }
	global Object clone() { }
	global Slack.MessageChangedEvent.Message getMessage() { }
	global void setMessage(Slack.MessageChangedEvent.Message message) { }

}

}