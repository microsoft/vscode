global class Channel {
	global Channel() { }
	global Object clone() { }
	global Integer getCreated() { }
	global String getCreator() { }
	global String getEnterpriseId() { }
	global String getId() { }
	global Integer getIsMoved() { }
	global String getLastRead() { }
	global Slack.Latest getLatest() { }
	global List<String> getMembers() { }
	global String getName() { }
	global String getNameNormalized() { }
	global Integer getNumMembers() { }
	global List<String> getPendingShared() { }
	global List<String> getPreviousNames() { }
	global Double getPriority() { }
	global Slack.Purpose getPurpose() { }
	global Slack.Topic getTopic() { }
	global Integer getUnlinked() { }
	global Integer getUnreadCount() { }
	global Integer getUnreadCountDisplay() { }
	global String getUser() { }
	global Boolean isArchived() { }
	global Boolean isChannel() { }
	global Boolean isExtShared() { }
	global Boolean isGeneral() { }
	global Boolean isGlobalShared() { }
	global Boolean isGroup() { }
	global Boolean isIm() { }
	global Boolean isMember() { }
	global Boolean isMpim() { }
	global Boolean isOrgDefault() { }
	global Boolean isOrgMandatory() { }
	global Boolean isOrgShared() { }
	global Boolean isPendingExtShared() { }
	global Boolean isPrivateChannel() { }
	global Boolean isReadOnly() { }
	global Boolean isShared() { }
	global Boolean isThreadOnly() { }
	global void setArchived(Boolean archived) { }
	global void setChannel(Boolean channel) { }
	global void setCreated(Integer created) { }
	global void setCreator(String creator) { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setExtShared(Boolean extShared) { }
	global void setGeneral(Boolean general) { }
	global void setGlobalShared(Boolean globalShared) { }
	global void setGroup(Boolean groupValue) { }
	global void setId(String id) { }
	global void setIm(Boolean im) { }
	global void setIsMoved(Integer isMoved) { }
	global void setLastRead(String lastRead) { }
	global void setLatest(Slack.Latest latest) { }
	global void setMember(Boolean member) { }
	global void setMembers(List<String> members) { }
	global void setMpim(Boolean mpim) { }
	global void setName(String name) { }
	global void setNameNormalized(String nameNormalized) { }
	global void setNumMembers(Integer numMembers) { }
	global void setOrgDefault(Boolean orgDefault) { }
	global void setOrgMandatory(Boolean orgMandatory) { }
	global void setOrgShared(Boolean orgShared) { }
	global void setPendingExtShared(Boolean pendingExtShared) { }
	global void setPendingShared(List<String> pendingShared) { }
	global void setPreviousNames(List<String> previousNames) { }
	global void setPriority(Double priority) { }
	global void setPrivateChannel(Boolean privateChannel) { }
	global void setPurpose(Slack.Purpose purpose) { }
	global void setReadOnly(Boolean readOnly) { }
	global void setShared(Boolean shared) { }
	global void setThreadOnly(Boolean threadOnly) { }
	global void setTopic(Slack.Topic topic) { }
	global void setUnlinked(Integer unlinked) { }
	global void setUnreadCount(Integer unreadCount) { }
	global void setUnreadCountDisplay(Integer unreadCountDisplay) { }
	global void setUser(String user) { }
	global String toString() { }

}