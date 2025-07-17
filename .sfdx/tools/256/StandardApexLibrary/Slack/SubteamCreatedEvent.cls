global class SubteamCreatedEvent {
	global SubteamCreatedEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global Slack.SubteamCreatedEvent.Subteam getSubteam() { }
	global String getSubtype() { }
	global String getType() { }
	global void setEventTs(String eventTs) { }
	global void setSubteam(Slack.SubteamCreatedEvent.Subteam subteam) { }
	global String toString() { }
global class Prefs {
	global SubteamCreatedEvent.Prefs() { }
	global Object clone() { }
	global List<String> getChannels() { }
	global List<String> getGroups() { }
	global void setChannels(List<String> channels) { }
	global void setGroups(List<String> groups) { }

}
global class Subteam {
	global SubteamCreatedEvent.Subteam() { }
	global Object clone() { }
	global String getAutoType() { }
	global Integer getChannelCount() { }
	global String getCreatedBy() { }
	global Integer getDateCreate() { }
	global Integer getDateDelete() { }
	global Integer getDateUpdate() { }
	global String getDeletedBy() { }
	global String getDescription() { }
	global String getEnterpriseSubteamId() { }
	global String getHandle() { }
	global String getId() { }
	global String getName() { }
	global Slack.SubteamCreatedEvent.Prefs getPrefs() { }
	global String getTeamId() { }
	global String getUpdatedBy() { }
	global Integer getUserCount() { }
	global List<String> getUsers() { }
	global Boolean isAutoProvision() { }
	global Boolean isExternal() { }
	global Boolean isSubteam() { }
	global Boolean isUsergroup() { }
	global void setAutoProvision(Boolean autoProvision) { }
	global void setAutoType(String autoType) { }
	global void setChannelCount(Integer channelCount) { }
	global void setCreatedBy(String createdBy) { }
	global void setDateCreate(Integer dateCreate) { }
	global void setDateDelete(Integer dateDelete) { }
	global void setDateUpdate(Integer dateUpdate) { }
	global void setDeletedBy(String deletedBy) { }
	global void setDescription(String description) { }
	global void setEnterpriseSubteamId(String enterpriseSubteamId) { }
	global void setExternal(Boolean external) { }
	global void setHandle(String handle) { }
	global void setId(String id) { }
	global void setName(String name) { }
	global void setPrefs(Slack.SubteamCreatedEvent.Prefs prefs) { }
	global void setSubteam(Boolean isSubteam) { }
	global void setTeamId(String teamId) { }
	global void setUpdatedBy(String updatedBy) { }
	global void setUserCount(Integer userCount) { }
	global void setUsergroup(Boolean isUsergroup) { }
	global void setUsers(List<String> users) { }

}

}