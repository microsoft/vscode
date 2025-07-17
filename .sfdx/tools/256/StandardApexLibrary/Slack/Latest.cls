global class Latest {
	global Latest() { }
	global Object clone() { }
	global String getBotId() { }
	global String getBotLink() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global Slack.Latest.Edited getEdited() { }
	global List<Slack.File> getFiles() { }
	global String getParentUserId() { }
	global List<Slack.Reaction> getReactions() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTopic() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global String getUsername() { }
	global List<String> getXFiles() { }
	global Boolean isDisplayAsBot() { }
	global Boolean isUpload() { }
	global void setBotId(String botId) { }
	global void setBotLink(String botLink) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setEdited(Slack.Latest.Edited edited) { }
	global void setFiles(List<Slack.File> files) { }
	global void setParentUserId(String parentUserId) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTopic(String topic) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUpload(Boolean upload) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }
	global void setXFiles(List<String> xFiles) { }
	global String toString() { }
global class Edited {
	global Latest.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}

}