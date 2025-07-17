global class Message {
	global Message() { }
	global Object clone() { }
	global String getAppId() { }
	global String getBotId() { }
	global String getBotLink() { }
	global Slack.BotProfile getBotProfile() { }
	global String getChannel() { }
	global String getClientMsgId() { }
	global Slack.Message.MessageItem getComment() { }
	global Slack.Message.Edited getEdited() { }
	global Slack.File getFile() { }
	global List<Slack.File> getFiles() { }
	global Slack.Message.Icons getIcons() { }
	global String getInviter() { }
	global Slack.Message.MessageItem getItem() { }
	global String getItemType() { }
	global String getLastRead() { }
	global String getLatestReply() { }
	global Slack.Message.Metadata getMetadata() { }
	global String getParentUserId() { }
	global List<String> getPinnedTo() { }
	global String getPurpose() { }
	global List<Slack.Reaction> getReactions() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global Slack.Message.MessageRoot getRoot() { }
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
	global Boolean isHidden() { }
	global Boolean isIntro() { }
	global Boolean isLocked() { }
	global Boolean isStarred() { }
	global Boolean isSubscribed() { }
	global Boolean isThreadBroadcast() { }
	global Boolean isUnfurlLinks() { }
	global Boolean isUnfurlMedia() { }
	global Boolean isUpload() { }
	global Boolean isWibblr() { }
	global void setAppId(String appId) { }
	global void setBotId(String botId) { }
	global void setBotLink(String botLink) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setChannel(String channel) { }
	global void setClientMsgId(String clientMsgId) { }
	global void setComment(Slack.Message.MessageItem comment) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setEdited(Slack.Message.Edited edited) { }
	global void setFile(Slack.File file) { }
	global void setFiles(List<Slack.File> files) { }
	global void setHidden(Boolean hidden) { }
	global void setIcons(Slack.Message.Icons icons) { }
	global void setIntro(Boolean intro) { }
	global void setInviter(String inviter) { }
	global void setItem(Slack.Message.MessageItem item) { }
	global void setItemType(String itemType) { }
	global void setLastRead(String lastRead) { }
	global void setLatestReply(String latestReply) { }
	global void setLocked(Boolean locked) { }
	global void setMetadata(Slack.Message.Metadata metadata) { }
	global void setParentUserId(String parentUserId) { }
	global void setPinnedTo(List<String> pinnedTo) { }
	global void setPurpose(String purpose) { }
	global void setReactions(List<Slack.Reaction> reactions) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setRoot(Slack.Message.MessageRoot root) { }
	global void setStarred(Boolean starred) { }
	global void setSubscribed(Boolean subscribed) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadBroadcast(Boolean threadBroadcast) { }
	global void setThreadTs(String threadTs) { }
	global void setTopic(String topic) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUnfurlLinks(Boolean unfurlLinks) { }
	global void setUnfurlMedia(Boolean unfurlMedia) { }
	global void setUpload(Boolean upload) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }
	global void setWibblr(Boolean wibblr) { }
	global void setXFiles(List<String> xFiles) { }
	global String toString() { }
global class Edited {
	global Message.Edited() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Icons {
	global Message.Icons() { }
	global Object clone() { }
	global String getEmoji() { }
	global String getImage36() { }
	global String getImage48() { }
	global String getImage64() { }
	global String getImage72() { }
	global void setEmoji(String emoji) { }
	global void setImage36(String image36) { }
	global void setImage48(String image48) { }
	global void setImage64(String image64) { }
	global void setImage72(String image72) { }

}
global class MessageItem {
	global Message.MessageItem() { }
	global Object clone() { }
	global String getComment() { }
	global String getCreated() { }
	global String getEditLink() { }
	global String getExternalType() { }
	global String getFiletype() { }
	global String getId() { }
	global Integer getLines() { }
	global Integer getLinesMore() { }
	global String getMediaDisplayType() { }
	global String getMimetype() { }
	global String getMode() { }
	global String getName() { }
	global String getPermalink() { }
	global String getPrettyType() { }
	global String getPreview() { }
	global String getPreviewHighlight() { }
	global Integer getSize() { }
	global String getTimestamp() { }
	global String getTitle() { }
	global String getUrlPrivate() { }
	global String getUser() { }
	global String getUsername() { }
	global Boolean isDisplayAsBot() { }
	global Boolean isEditable() { }
	global Boolean isExternal() { }
	global Boolean isHasRichPreview() { }
	global Boolean isIntro() { }
	global Boolean isPermalinkPublic() { }
	global Boolean isPreviewTruncated() { }
	global Boolean isPublicUrlShared() { }
	global Boolean isStarred() { }
	global Boolean isUrlPrivateDownload() { }
	global Boolean ispublic() { }
	global void setComment(String comment) { }
	global void setCreated(String created) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setEditLink(String editLink) { }
	global void setEditable(Boolean editable) { }
	global void setExternal(Boolean external) { }
	global void setExternalType(String externalType) { }
	global void setFiletype(String filetype) { }
	global void setHasRichPreview(Boolean hasRichPreview) { }
	global void setId(String id) { }
	global void setIntro(Boolean intro) { }
	global void setLines(Integer lines) { }
	global void setLinesMore(Integer linesMore) { }
	global void setMediaDisplayType(String mediaDisplayType) { }
	global void setMimetype(String mimetype) { }
	global void setMode(String mode) { }
	global void setName(String name) { }
	global void setPermalink(String permalink) { }
	global void setPermalinkPublic(Boolean permalinkPublic) { }
	global void setPrettyType(String prettyType) { }
	global void setPreview(String preview) { }
	global void setPreviewHighlight(String previewHighlight) { }
	global void setPreviewTruncated(Boolean previewTruncated) { }
	global void setPublicUrlShared(Boolean publicUrlShared) { }
	global void setSize(Integer size) { }
	global void setStarred(Boolean starred) { }
	global void setTimestamp(String timestamp) { }
	global void setTitle(String title) { }
	global void setUrlPrivate(String urlPrivate) { }
	global void setUrlPrivateDownload(Boolean urlPrivateDownload) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }
	global void setpublic(Boolean _public) { }

}
global class MessageRoot {
	global Message.MessageRoot() { }
	global Object clone() { }
	global String getBotId() { }
	global Slack.BotProfile getBotProfile() { }
	global Slack.Message.Edited getEdited() { }
	global Slack.Message.Icons getIcons() { }
	global String getLastRead() { }
	global String getLatestReply() { }
	global String getParentUserId() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global String getSubtype() { }
	global String getTeam() { }
	global String getText() { }
	global String getThreadTs() { }
	global String getTs() { }
	global String getType() { }
	global Integer getUnreadCount() { }
	global String getUser() { }
	global String getUsername() { }
	global Boolean isMrkdwn() { }
	global Boolean isSubscribed() { }
	global void setBotId(String botId) { }
	global void setBotProfile(Slack.BotProfile botProfile) { }
	global void setEdited(Slack.Message.Edited edited) { }
	global void setIcons(Slack.Message.Icons icons) { }
	global void setLastRead(String lastRead) { }
	global void setLatestReply(String latestReply) { }
	global void setMrkdwn(Boolean mrkdwn) { }
	global void setParentUserId(String parentUserId) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setSubscribed(Boolean subscribed) { }
	global void setSubtype(String subtype) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUnreadCount(Integer unreadCount) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }

}
global class MessageRootReply {
	global Message.MessageRootReply() { }
	global Object clone() { }
	global String getTs() { }
	global String getUser() { }
	global void setTs(String ts) { }
	global void setUser(String user) { }

}
global class Metadata {
	global Message.Metadata() { }
	global Object clone() { }
	global Map<String,Object> getEventPayload() { }
	global String getEventType() { }
	global void setEventPayload(Map<String,Object> eventPayload) { }
	global void setEventType(String eventType) { }

}

}