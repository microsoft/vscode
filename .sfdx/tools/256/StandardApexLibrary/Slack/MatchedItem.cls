global class MatchedItem {
	global MatchedItem() { }
	global Object clone() { }
	global String getBotId() { }
	global List<Slack.MatchedItem.Address> getCc() { }
	global Slack.Channel getChannel() { }
	global Integer getChannelActionsCount() { }
	global String getChannelActionsTs() { }
	global List<String> getChannels() { }
	global String getComment() { }
	global Integer getCommentsCount() { }
	global String getConvertedPdf() { }
	global String getCreated() { }
	global String getDeanimateGif() { }
	global String getEditLink() { }
	global String getEditor() { }
	global String getExternalId() { }
	global String getExternalType() { }
	global String getExternalUrl() { }
	global String getFileAccess() { }
	global String getFileId() { }
	global List<Slack.File> getFiles() { }
	global String getFiletype() { }
	global List<Slack.MatchedItem.Address> getFrom() { }
	global List<String> getGroups() { }
	global String getId() { }
	global String getIid() { }
	global Integer getImageExifRotation() { }
	global List<String> getIms() { }
	global String getLastEditor() { }
	global Integer getLines() { }
	global Integer getLinesMore() { }
	global String getMediaDisplayType() { }
	global String getMimetype() { }
	global String getMode() { }
	global String getName() { }
	global Slack.MatchedItem.OtherItem getNext() { }
	global Slack.MatchedItem.OtherItem getNext2() { }
	global String getOriginalHeight() { }
	global String getOriginalWidth() { }
	global String getPermalink() { }
	global String getPlainText() { }
	global String getPrettyType() { }
	global String getPreview() { }
	global String getPreviewHighlight() { }
	global String getPreviewPlainText() { }
	global Slack.MatchedItem.OtherItem getPrevious() { }
	global Slack.MatchedItem.OtherItem getPrevious2() { }
	global String getScore() { }
	global Integer getSize() { }
	global String getSourceTeam() { }
	global String getSubject() { }
	global String getTeam() { }
	global String getText() { }
	global String getThumb1024() { }
	global String getThumb1024Gif() { }
	global String getThumb1024Height() { }
	global String getThumb1024Width() { }
	global String getThumb160() { }
	global String getThumb160Gif() { }
	global String getThumb160Height() { }
	global String getThumb160Width() { }
	global String getThumb360() { }
	global String getThumb360Gif() { }
	global String getThumb360Height() { }
	global String getThumb360Width() { }
	global String getThumb480() { }
	global String getThumb480Gif() { }
	global String getThumb480Height() { }
	global String getThumb480Width() { }
	global String getThumb64() { }
	global String getThumb64Gif() { }
	global String getThumb64Height() { }
	global String getThumb64Width() { }
	global String getThumb720() { }
	global String getThumb720Gif() { }
	global String getThumb720Height() { }
	global String getThumb720Width() { }
	global String getThumb80() { }
	global String getThumb800() { }
	global String getThumb800Gif() { }
	global String getThumb800Height() { }
	global String getThumb800Width() { }
	global String getThumb80Gif() { }
	global String getThumb80Height() { }
	global String getThumb80Width() { }
	global String getThumb960() { }
	global String getThumb960Gif() { }
	global String getThumb960Height() { }
	global String getThumb960Width() { }
	global String getThumbPdf() { }
	global String getThumbPdfHeight() { }
	global String getThumbPdfWidth() { }
	global String getThumbTiny() { }
	global String getThumbVideo() { }
	global String getTimestamp() { }
	global String getTitle() { }
	global List<Slack.MatchedItem.Address> getTo() { }
	global String getTs() { }
	global String getType() { }
	global Integer getUpdated() { }
	global String getUrlPrivate() { }
	global String getUser() { }
	global String getUserTeam() { }
	global String getUsername() { }
	global Boolean isDisplayAsBot() { }
	global Boolean isEditable() { }
	global Boolean isExternal() { }
	global Boolean isHasMore() { }
	global Boolean isHasRichPreview() { }
	global Boolean isMpim() { }
	global Boolean isNoReactions() { }
	global Boolean isNonOwnerEditable() { }
	global Boolean isPermalinkPublic() { }
	global Boolean isPreviewTruncated() { }
	global Boolean isPublicUrlShared() { }
	global Boolean isSentToSelf() { }
	global Boolean isStarred() { }
	global Boolean isTopFile() { }
	global Boolean isUrlPrivateDownload() { }
	global Boolean ispublic() { }
	global void setBotId(String botId) { }
	global void setCc(List<Slack.MatchedItem.Address> cc) { }
	global void setChannel(Slack.Channel channel) { }
	global void setChannelActionsCount(Integer channelActionsCount) { }
	global void setChannelActionsTs(String channelActionsTs) { }
	global void setChannels(List<String> channels) { }
	global void setComment(String comment) { }
	global void setCommentsCount(Integer commentsCount) { }
	global void setConvertedPdf(String convertedPdf) { }
	global void setCreated(String created) { }
	global void setDeanimateGif(String deanimateGif) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setEditLink(String editLink) { }
	global void setEditable(Boolean editable) { }
	global void setEditor(String editor) { }
	global void setExternal(Boolean external) { }
	global void setExternalId(String externalId) { }
	global void setExternalType(String externalType) { }
	global void setExternalUrl(String externalUrl) { }
	global void setFileAccess(String fileAccess) { }
	global void setFileId(String fileId) { }
	global void setFiles(List<Slack.File> files) { }
	global void setFiletype(String filetype) { }
	global void setFrom(List<Slack.MatchedItem.Address> fromValue) { }
	global void setGroups(List<String> groups) { }
	global void setHasMore(Boolean hasMore) { }
	global void setHasRichPreview(Boolean hasRichPreview) { }
	global void setId(String id) { }
	global void setIid(String iid) { }
	global void setImageExifRotation(Integer imageExifRotation) { }
	global void setIms(List<String> ims) { }
	global void setLastEditor(String lastEditor) { }
	global void setLines(Integer lines) { }
	global void setLinesMore(Integer linesMore) { }
	global void setMediaDisplayType(String mediaDisplayType) { }
	global void setMimetype(String mimetype) { }
	global void setMode(String mode) { }
	global void setMpim(Boolean mpim) { }
	global void setName(String name) { }
	global void setNext(Slack.MatchedItem.OtherItem next) { }
	global void setNext2(Slack.MatchedItem.OtherItem next2) { }
	global void setNoReactions(Boolean noReactions) { }
	global void setNonOwnerEditable(Boolean nonOwnerEditable) { }
	global void setOriginalHeight(String originalHeight) { }
	global void setOriginalWidth(String originalWidth) { }
	global void setPermalink(String permalink) { }
	global void setPermalinkPublic(Boolean permalinkPublic) { }
	global void setPlainText(String plainText) { }
	global void setPrettyType(String prettyType) { }
	global void setPreview(String preview) { }
	global void setPreviewHighlight(String previewHighlight) { }
	global void setPreviewPlainText(String previewPlainText) { }
	global void setPreviewTruncated(Boolean previewTruncated) { }
	global void setPrevious(Slack.MatchedItem.OtherItem previous) { }
	global void setPrevious2(Slack.MatchedItem.OtherItem previous2) { }
	global void setPublicUrlShared(Boolean publicUrlShared) { }
	global void setScore(String score) { }
	global void setSentToSelf(Boolean sentToSelf) { }
	global void setSize(Integer size) { }
	global void setSourceTeam(String sourceTeam) { }
	global void setStarred(Boolean starred) { }
	global void setSubject(String subject) { }
	global void setTeam(String team) { }
	global void setText(String text) { }
	global void setThumb1024(String thumb1024) { }
	global void setThumb1024Gif(String thumb1024Gif) { }
	global void setThumb1024Height(String thumb1024Height) { }
	global void setThumb1024Width(String thumb1024Width) { }
	global void setThumb160(String thumb160) { }
	global void setThumb160Gif(String thumb160Gif) { }
	global void setThumb160Height(String thumb160Height) { }
	global void setThumb160Width(String thumb160Width) { }
	global void setThumb360(String thumb360) { }
	global void setThumb360Gif(String thumb360Gif) { }
	global void setThumb360Height(String thumb360Height) { }
	global void setThumb360Width(String thumb360Width) { }
	global void setThumb480(String thumb480) { }
	global void setThumb480Gif(String thumb480Gif) { }
	global void setThumb480Height(String thumb480Height) { }
	global void setThumb480Width(String thumb480Width) { }
	global void setThumb64(String thumb64) { }
	global void setThumb64Gif(String thumb64Gif) { }
	global void setThumb64Height(String thumb64Height) { }
	global void setThumb64Width(String thumb64Width) { }
	global void setThumb720(String thumb720) { }
	global void setThumb720Gif(String thumb720Gif) { }
	global void setThumb720Height(String thumb720Height) { }
	global void setThumb720Width(String thumb720Width) { }
	global void setThumb80(String thumb80) { }
	global void setThumb800(String thumb800) { }
	global void setThumb800Gif(String thumb800Gif) { }
	global void setThumb800Height(String thumb800Height) { }
	global void setThumb800Width(String thumb800Width) { }
	global void setThumb80Gif(String thumb80Gif) { }
	global void setThumb80Height(String thumb80Height) { }
	global void setThumb80Width(String thumb80Width) { }
	global void setThumb960(String thumb960) { }
	global void setThumb960Gif(String thumb960Gif) { }
	global void setThumb960Height(String thumb960Height) { }
	global void setThumb960Width(String thumb960Width) { }
	global void setThumbPdf(String thumbPdf) { }
	global void setThumbPdfHeight(String thumbPdfHeight) { }
	global void setThumbPdfWidth(String thumbPdfWidth) { }
	global void setThumbTiny(String thumbTiny) { }
	global void setThumbVideo(String thumbVideo) { }
	global void setTimestamp(String timestamp) { }
	global void setTitle(String title) { }
	global void setTo(List<Slack.MatchedItem.Address> to) { }
	global void setTopFile(Boolean topFile) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUpdated(Integer updated) { }
	global void setUrlPrivate(String urlPrivate) { }
	global void setUrlPrivateDownload(Boolean urlPrivateDownload) { }
	global void setUser(String user) { }
	global void setUserTeam(String userTeam) { }
	global void setUsername(String username) { }
	global void setpublic(Boolean _public) { }
	global String toString() { }
global class Address {
	global MatchedItem.Address() { }
	global Object clone() { }
	global String getAddress() { }
	global String getName() { }
	global String getOriginal() { }
	global void setAddress(String address) { }
	global void setName(String name) { }
	global void setOriginal(String original) { }

}
global class OtherItem {
	global MatchedItem.OtherItem() { }
	global Object clone() { }
	global String getIid() { }
	global String getPermalink() { }
	global String getText() { }
	global String getTs() { }
	global String getType() { }
	global String getUser() { }
	global String getUsername() { }
	global void setIid(String iid) { }
	global void setPermalink(String permalink) { }
	global void setText(String text) { }
	global void setTs(String ts) { }
	global void setType(String type) { }
	global void setUser(String user) { }
	global void setUsername(String username) { }

}

}