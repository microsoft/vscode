global class StarsListResponse {
	global StarsListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.StarsListResponse.Item> getItems() { }
	global String getNeeded() { }
	global Slack.Paging getPaging() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setItems(List<Slack.StarsListResponse.Item> items) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPaging(Slack.Paging paging) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Comment {
	global StarsListResponse.Comment() { }
	global Object clone() { }
	global String getComment() { }
	global Integer getCreated() { }
	global String getId() { }
	global Integer getNumStars() { }
	global Integer getTimestamp() { }
	global String getUser() { }
	global Boolean isIntro() { }
	global Boolean isStarred() { }
	global void setComment(String comment) { }
	global void setCreated(Integer created) { }
	global void setId(String id) { }
	global void setIntro(Boolean intro) { }
	global void setNumStars(Integer numStars) { }
	global void setStarred(Boolean starred) { }
	global void setTimestamp(Integer timestamp) { }
	global void setUser(String user) { }

}
global class Edited {
	global StarsListResponse.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Item {
	global StarsListResponse.Item() { }
	global Object clone() { }
	global String getChannel() { }
	global Slack.StarsListResponse.Comment getComment() { }
	global Integer getDateCreate() { }
	global Slack.File getFile() { }
	global Slack.StarsListResponse.Message getMessage() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setComment(Slack.StarsListResponse.Comment comment) { }
	global void setDateCreate(Integer dateCreate) { }
	global void setFile(Slack.File file) { }
	global void setMessage(Slack.StarsListResponse.Message message) { }
	global void setType(String type) { }

}
global class Message {
	global StarsListResponse.Message() { }
	global Object clone() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global Boolean getDisplayAsBot() { }
	global Slack.StarsListResponse.Edited getEdited() { }
	global List<Slack.File> getFiles() { }
	global String getInviter() { }
	global String getLastRead() { }
	global String getLatestReply() { }
	global String getPermalink() { }
	global List<Slack.Reaction> getReactions() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global Boolean getUpload() { }
	global String getUser() { }
	global String getUsername() { }
	global Boolean isLocked() { }
	global Boolean isStarred() { }
	global Boolean isSubscribed() { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setEdited(Slack.StarsListResponse.Edited edited) { }
	global void setFiles(List<Slack.File> files) { }
	global void setInviter(String inviter) { }
	global void setLastRead(String lastRead) { }
	global void setLatestReply(String latestReply) { }
	global void setLocked(Boolean locked) { }
	global void setPermalink(String permalink) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setStarred(Boolean starred) { }
	global void setSubscribed(Boolean subscribed) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUpload(Boolean upload) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }

}
global class MessageRootReply {
	global StarsListResponse.MessageRootReply() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}

}