global class Call {
	global Call() { }
	global Object clone() { }
	global List<String> getChannels() { }
	global Integer getDateEnd() { }
	global Integer getDateStart() { }
	global String getDesktopAppJoinUrl() { }
	global String getExternalDisplayId() { }
	global String getExternalUniqueId() { }
	global String getId() { }
	global String getJoinUrl() { }
	global String getTitle() { }
	global List<Slack.CallParticipant> getUsers() { }
	global void setChannels(List<String> channels) { }
	global void setDateEnd(Integer dateEnd) { }
	global void setDateStart(Integer dateStart) { }
	global void setDesktopAppJoinUrl(String desktopAppJoinUrl) { }
	global void setExternalDisplayId(String externalDisplayId) { }
	global void setExternalUniqueId(String externalUniqueId) { }
	global void setId(String id) { }
	global void setJoinUrl(String joinUrl) { }
	global void setTitle(String title) { }
	global void setUsers(List<Slack.CallParticipant> users) { }
	global String toString() { }

}