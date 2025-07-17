global class File {
	global File() { }
	global Object clone() { }
	global String getAltTxt() { }
	global String getAppId() { }
	global String getAppName() { }
	global List<Slack.File.Address> getCc() { }
	global Integer getChannelActionsCount() { }
	global String getChannelActionsTs() { }
	global List<String> getChannels() { }
	global String getConvertedPdf() { }
	global Integer getCreated() { }
	global String getDeanimate() { }
	global String getDeanimateGif() { }
	global Integer getDurationMs() { }
	global String getEditLink() { }
	global String getEditor() { }
	global String getExternalId() { }
	global String getExternalType() { }
	global String getExternalUrl() { }
	global String getFileAccess() { }
	global String getFiletype() { }
	global List<Slack.File.Address> getFrom() { }
	global List<String> getGroups() { }
	global Slack.File.Headers getHeaders() { }
	global String getHls() { }
	global String getHlsEmbed() { }
	global String getId() { }
	global Integer getImageExifRotation() { }
	global List<String> getIms() { }
	global String getLastEditor() { }
	global Integer getLines() { }
	global Integer getLinesMore() { }
	global String getMediaDisplayType() { }
	global Slack.File.MediaProgress getMediaProgress() { }
	global String getMimetype() { }
	global String getMode() { }
	global String getMp4() { }
	global String getName() { }
	global Integer getOriginalAttachmentCount() { }
	global String getOriginalHeight() { }
	global String getOriginalWidth() { }
	global String getPermalink() { }
	global String getPermalinkPublic() { }
	global Map<String,Slack.File.PinnedInfo> getPinnedInfo() { }
	global String getPjpeg() { }
	global String getPlainText() { }
	global String getPrettyType() { }
	global String getPreview() { }
	global String getPreviewHighlight() { }
	global String getPreviewPlainText() { }
	global Slack.File.Shares getShares() { }
	global String getSimplifiedHtml() { }
	global Integer getSize() { }
	global String getSubject() { }
	global String getSubtype() { }
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
	global String getThumbGif() { }
	global String getThumbPdf() { }
	global String getThumbPdfHeight() { }
	global String getThumbPdfWidth() { }
	global String getThumbTiny() { }
	global String getThumbVideo() { }
	global Integer getThumbVideoH() { }
	global Integer getThumbVideoW() { }
	global Integer getTimestamp() { }
	global String getTitle() { }
	global List<Slack.File.Address> getTo() { }
	global Slack.File.Transcription getTranscription() { }
	global Integer getUpdated() { }
	global String getUrlPrivate() { }
	global String getUrlPrivateDownload() { }
	global String getUser() { }
	global String getUserTeam() { }
	global String getUsername() { }
	global String getVtt() { }
	global Boolean isDisplayAsBot() { }
	global Boolean isEditable() { }
	global Boolean isExternal() { }
	global Boolean isHasMore() { }
	global Boolean isHasRichPreview() { }
	global Boolean isNonOwnerEditable() { }
	global Boolean isPreviewTruncated() { }
	global Boolean isPublicUrlShared() { }
	global Boolean isSentToSelf() { }
	global Boolean isStarred() { }
	global Boolean ispublic() { }
	global void setAltTxt(String altTxt) { }
	global void setAppId(String appId) { }
	global void setAppName(String appName) { }
	global void setCc(List<Slack.File.Address> cc) { }
	global void setChannelActionsCount(Integer channelActionsCount) { }
	global void setChannelActionsTs(String channelActionsTs) { }
	global void setChannels(List<String> channels) { }
	global void setConvertedPdf(String convertedPdf) { }
	global void setCreated(Integer created) { }
	global void setDeanimate(String deanimate) { }
	global void setDeanimateGif(String deanimateGif) { }
	global void setDisplayAsBot(Boolean displayAsBot) { }
	global void setDurationMs(Integer durationMs) { }
	global void setEditLink(String editLink) { }
	global void setEditable(Boolean editable) { }
	global void setEditor(String editor) { }
	global void setExternal(Boolean external) { }
	global void setExternalId(String externalId) { }
	global void setExternalType(String externalType) { }
	global void setExternalUrl(String externalUrl) { }
	global void setFileAccess(String fileAccess) { }
	global void setFiletype(String filetype) { }
	global void setFrom(List<Slack.File.Address> fromValue) { }
	global void setGroups(List<String> groups) { }
	global void setHasMore(Boolean hasMore) { }
	global void setHasRichPreview(Boolean hasRichPreview) { }
	global void setHeaders(Slack.File.Headers headers) { }
	global void setHls(String hls) { }
	global void setHlsEmbed(String hlsEmbed) { }
	global void setId(String id) { }
	global void setImageExifRotation(Integer imageExifRotation) { }
	global void setIms(List<String> ims) { }
	global void setLastEditor(String lastEditor) { }
	global void setLines(Integer lines) { }
	global void setLinesMore(Integer linesMore) { }
	global void setMediaDisplayType(String mediaDisplayType) { }
	global void setMediaProgress(Slack.File.MediaProgress mediaProgress) { }
	global void setMimetype(String mimetype) { }
	global void setMode(String mode) { }
	global void setMp4(String mp4) { }
	global void setName(String name) { }
	global void setNonOwnerEditable(Boolean nonOwnerEditable) { }
	global void setOriginalAttachmentCount(Integer originalAttachmentCount) { }
	global void setOriginalHeight(String originalHeight) { }
	global void setOriginalWidth(String originalWidth) { }
	global void setPermalink(String permalink) { }
	global void setPermalinkPublic(String permalinkPublic) { }
	global void setPinnedInfo(Map<String,Slack.File.PinnedInfo> pinnedInfo) { }
	global void setPjpeg(String pjpeg) { }
	global void setPlainText(String plainText) { }
	global void setPrettyType(String prettyType) { }
	global void setPreview(String preview) { }
	global void setPreviewHighlight(String previewHighlight) { }
	global void setPreviewPlainText(String previewPlainText) { }
	global void setPreviewTruncated(Boolean previewTruncated) { }
	global void setPublicUrlShared(Boolean publicUrlShared) { }
	global void setSentToSelf(Boolean sentToSelf) { }
	global void setShares(Slack.File.Shares shares) { }
	global void setSimplifiedHtml(String simplifiedHtml) { }
	global void setSize(Integer size) { }
	global void setStarred(Boolean starred) { }
	global void setSubject(String subject) { }
	global void setSubtype(String subtype) { }
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
	global void setThumbGif(String thumbGif) { }
	global void setThumbPdf(String thumbPdf) { }
	global void setThumbPdfHeight(String thumbPdfHeight) { }
	global void setThumbPdfWidth(String thumbPdfWidth) { }
	global void setThumbTiny(String thumbTiny) { }
	global void setThumbVideo(String thumbVideo) { }
	global void setThumbVideoH(Integer thumbVideoH) { }
	global void setThumbVideoW(Integer thumbVideoW) { }
	global void setTimestamp(Integer timestamp) { }
	global void setTitle(String title) { }
	global void setTo(List<Slack.File.Address> to) { }
	global void setTranscription(Slack.File.Transcription transcription) { }
	global void setUpdated(Integer updated) { }
	global void setUrlPrivate(String urlPrivate) { }
	global void setUrlPrivateDownload(String urlPrivateDownload) { }
	global void setUser(String user) { }
	global void setUserTeam(String userTeam) { }
	global void setUsername(String username) { }
	global void setVtt(String vtt) { }
	global void setpublic(Boolean _public) { }
	global String toString() { }
global class Address {
	global File.Address() { }
	global Object clone() { }
	global String getAddress() { }
	global String getName() { }
	global String getOriginal() { }
	global void setAddress(String address) { }
	global void setName(String name) { }
	global void setOriginal(String original) { }

}
global class Headers {
	global File.Headers() { }
	global Object clone() { }
	global String getDate() { }
	global String getInReplyTo() { }
	global String getMessageId() { }
	global String getReplyTo() { }
	global void setDate(String dateValue) { }
	global void setInReplyTo(String inReplyTo) { }
	global void setMessageId(String messageId) { }
	global void setReplyTo(String replyTo) { }

}
global class MediaProgress {
	global File.MediaProgress() { }
	global Object clone() { }
	global Integer getDurationMs() { }
	global Integer getMaxOffsetMs() { }
	global Integer getOffsetMs() { }
	global void setDurationMs(Integer durationMs) { }
	global void setMaxOffsetMs(Integer maxOffsetMs) { }
	global void setOffsetMs(Integer offsetMs) { }

}
global class PinnedInfo {
	global File.PinnedInfo() { }
	global Object clone() { }
	global String getPinnedBy() { }
	global Integer getPinnedTs() { }
	global void setPinnedBy(String pinnedBy) { }
	global void setPinnedTs(Integer pinnedTs) { }

}
global class ShareDetail {
	global File.ShareDetail() { }
	global Object clone() { }
	global String getChannelName() { }
	global String getLatestReply() { }
	global Integer getReplyCount() { }
	global List<String> getReplyUsers() { }
	global Integer getReplyUsersCount() { }
	global String getShareUserId() { }
	global String getTeamId() { }
	global String getThreadTs() { }
	global String getTs() { }
	global void setChannelName(String channelName) { }
	global void setLatestReply(String latestReply) { }
	global void setReplyCount(Integer replyCount) { }
	global void setReplyUsers(List<String> replyUsers) { }
	global void setReplyUsersCount(Integer replyUsersCount) { }
	global void setShareUserId(String shareUserId) { }
	global void setTeamId(String teamId) { }
	global void setThreadTs(String threadTs) { }
	global void setTs(String ts) { }

}
global class Shares {
	global File.Shares() { }
	global Object clone() { }
	global Map<String,List<Slack.File.ShareDetail>> getPrivateChannels() { }
	global Map<String,List<Slack.File.ShareDetail>> getPublicChannels() { }
	global void setPrivateChannels(Map<String,List<Slack.File.ShareDetail>> privateChannels) { }
	global void setPublicChannels(Map<String,List<Slack.File.ShareDetail>> publicChannels) { }

}
global class Transcription {
	global File.Transcription() { }
	global Object clone() { }
	global String getLocale() { }
	global String getStatus() { }
	global void setLocale(String locale) { }
	global void setStatus(String status) { }

}

}