global class Conversation {
	global Conversation() { }
	global Object clone() { }
	global List<String> getConnectedLimitedTeamIds() { }
	global List<String> getConnectedTeamIds() { }
	global String getContextTeamId() { }
	global String getConversationHostId() { }
	global Integer getCreated() { }
	global String getCreator() { }
	global Integer getDateConnected() { }
	global String getEnterpriseId() { }
	global String getId() { }
	global List<String> getInternalTeamIds() { }
	global Integer getIsMoved() { }
	global Boolean getIsUserDeleted() { }
	global String getLastRead() { }
	global Slack.Latest getLatest() { }
	global String getLocale() { }
	global String getName() { }
	global String getNameNormalized() { }
	global Integer getNumOfMembers() { }
	global String getParentConversation() { }
	global List<String> getPendingConnectedTeamIds() { }
	global List<String> getPendingShared() { }
	global List<String> getPreviousNames() { }
	global Double getPriority() { }
	global Slack.Purpose getPurpose() { }
	global List<String> getSharedTeamIds() { }
	global Slack.Topic getTopic() { }
	global Integer getUnlinked() { }
	global Integer getUnreadCount() { }
	global Integer getUnreadCountDisplay() { }
	global Long getUpdated() { }
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
	global Boolean isNonThreadable() { }
	global Boolean isOpen() { }
	global Boolean isOrgDefault() { }
	global Boolean isOrgMandatory() { }
	global Boolean isOrgShared() { }
	global Boolean isPendingExtShared() { }
	global Boolean isPrivate() { }
	global Boolean isReadOnly() { }
	global Boolean isShared() { }
	global Boolean isStarred() { }
	global Boolean isThreadOnly() { }
	global void setArchived(Boolean isArchived) { }
	global void setChannel(Boolean isChannel) { }
	global void setConnectedLimitedTeamIds(List<String> connectedLimitedTeamIds) { }
	global void setConnectedTeamIds(List<String> connectedTeamIds) { }
	global void setContextTeamId(String contextTeamId) { }
	global void setConversationHostId(String conversationHostId) { }
	global void setCreated(Integer created) { }
	global void setCreator(String creator) { }
	global void setDateConnected(Integer dateConnected) { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setExtShared(Boolean isExtShared) { }
	global void setGeneral(Boolean isGeneral) { }
	global void setGlobalShared(Boolean globalShared) { }
	global void setGroup(Boolean isGroup) { }
	global void setId(String id) { }
	global void setIm(Boolean isIm) { }
	global void setInternalTeamIds(List<String> internalTeamIds) { }
	global void setIsMoved(Integer isMoved) { }
	global void setIsUserDeleted(Boolean isUserDeleted) { }
	global void setLastRead(String lastRead) { }
	global void setLatest(Slack.Latest latest) { }
	global void setLocale(String locale) { }
	global void setMember(Boolean isMember) { }
	global void setMpim(Boolean isMpim) { }
	global void setName(String name) { }
	global void setNameNormalized(String nameNormalized) { }
	global void setNonThreadable(Boolean isNonThreadable) { }
	global void setNumOfMembers(Integer numOfMembers) { }
	global void setOpen(Boolean open) { }
	global void setOrgDefault(Boolean orgDefault) { }
	global void setOrgMandatory(Boolean orgMandatory) { }
	global void setOrgShared(Boolean isOrgShared) { }
	global void setParentConversation(String parentConversation) { }
	global void setPendingConnectedTeamIds(List<String> pendingConnectedTeamIds) { }
	global void setPendingExtShared(Boolean isPendingExtShared) { }
	global void setPendingShared(List<String> pendingShared) { }
	global void setPreviousNames(List<String> previousNames) { }
	global void setPriority(Double priority) { }
	global void setPrivate(Boolean isPrivate) { }
	global void setPurpose(Slack.Purpose purpose) { }
	global void setReadOnly(Boolean isReadOnly) { }
	global void setShared(Boolean isShared) { }
	global void setSharedTeamIds(List<String> sharedTeamIds) { }
	global void setStarred(Boolean isStarred) { }
	global void setThreadOnly(Boolean isThreadOnly) { }
	global void setTopic(Slack.Topic topic) { }
	global void setUnlinked(Integer unlinked) { }
	global void setUnreadCount(Integer unreadCount) { }
	global void setUnreadCountDisplay(Integer unreadCountDisplay) { }
	global void setUpdated(Long updated) { }
	global void setUser(String user) { }
	global String toString() { }

}