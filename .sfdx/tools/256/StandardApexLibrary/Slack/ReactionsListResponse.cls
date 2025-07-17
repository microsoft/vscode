global class ReactionsListResponse {
	global ReactionsListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.ReactionsListResponse.Item> getItems() { }
	global String getNeeded() { }
	global Slack.Paging getPaging() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setItems(List<Slack.ReactionsListResponse.Item> items) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPaging(Slack.Paging paging) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Icons {
	global ReactionsListResponse.Icons() { }
	global Object clone() { }
	global String getImage36() { }
	global String getImage48() { }
	global String getImage64() { }
	global String getImage72() { }
	global void setImage36(String image36) { }
	global void setImage48(String image48) { }
	global void setImage64(String image64) { }
	global void setImage72(String image72) { }

}
global class Item {
	global ReactionsListResponse.Item() { }
	global Object clone() { }
	global String getChannel() { }
	global Slack.ReactionsListResponse.Message getMessage() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setMessage(Slack.ReactionsListResponse.Message message) { }
	global void setType(String type) { }

}
global class Message {
	global ReactionsListResponse.Message() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global String getClientMsgId() { }
	global List<Slack.File> getFiles() { }
	global Slack.ReactionsListResponse.Icons getIcons() { }
	global String getInviter() { }
	global String getLastRead() { }
	global String getLatestReply() { }
	global String getParentUserId() { }
	global String getPermalink() { }
	global List<Slack.Reaction> getReactions() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global String getSourceTeam() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global Slack.ReactionsListResponse.UserProfile getUserProfile() { }
	global String getUserTeam() { }
	global String getUsername() { }
	global Boolean isDisplayAsBot() { }
	global Boolean isLocked() { }
	global Boolean isSubscribed() { }
	global Boolean isUpload() { }
	global void setAppId(String appId) { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setFiles(List<Slack.File> files) { }
	global void setIcons(Slack.ReactionsListResponse.Icons icons) { }
	global void setInviter(String inviter) { }
	global void setLastRead(String lastRead) { }
	global void setLatestReply(String latestReply) { }
	global void setLocked(Boolean locked) { }
	global void setParentUserId(String parentUserId) { }
	global void setPermalink(String permalink) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setSourceTeam(String sourceTeam) { }
	global void setSubscribed(Boolean subscribed) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUpload(Boolean upload) { }
	global void setUser(String user) { }
	global void setUserProfile(Slack.ReactionsListResponse.UserProfile userProfile) { }
	global void setUserTeam(String userTeam) { }
	global void setUsername(String username) { }

}
global class MessageRootReply {
	global ReactionsListResponse.MessageRootReply() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class UserProfile {
	global ReactionsListResponse.UserProfile() { }
	global Object clone() { }
	global String getAvatarHash() { }
	global String getDisplayName() { }
	global String getFirstName() { }
	global String getImage72() { }
	global String getName() { }
	global String getRealName() { }
	global String getTeam() { }
	global Boolean isRestricted() { }
	global Boolean isUltraRestricted() { }
	global void setAvatarHash(String avatarHash) { }
	global void setDisplayName(String displayName) { }
	global void setFirstName(String firstName) { }
	global void setImage72(String image72) { }
	global void setName(String name) { }
	global void setRealName(String realName) { }
	global void setRestricted(Boolean restricted) { }
	global void setTeam(String team) { }
	global void setUltraRestricted(Boolean ultraRestricted) { }

}

}