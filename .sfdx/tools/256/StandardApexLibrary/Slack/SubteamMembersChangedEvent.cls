global class SubteamMembersChangedEvent {
	global SubteamMembersChangedEvent() { }
	global Object clone() { }
	global List<String> getAddedUsers() { }
	global Integer getAddedUsersCount() { }
	global Integer getDatePreviousUpdate() { }
	global Integer getDateUpdate() { }
	global String getEventTs() { }
	global List<String> getRemovedUsers() { }
	global Integer getRemovedUsersCount() { }
	global String getSubteamId() { }
	global String getSubtype() { }
	global String getTeamId() { }
	global String getType() { }
	global void setAddedUsers(List<String> addedUsers) { }
	global void setAddedUsersCount(Integer addedUsersCount) { }
	global void setDatePreviousUpdate(Integer datePreviousUpdate) { }
	global void setDateUpdate(Integer dateUpdate) { }
	global void setEventTs(String eventTs) { }
	global void setRemovedUsers(List<String> removedUsers) { }
	global void setRemovedUsersCount(Integer removedUsersCount) { }
	global void setSubteamId(String subteamId) { }
	global void setTeamId(String teamId) { }
	global String toString() { }

}