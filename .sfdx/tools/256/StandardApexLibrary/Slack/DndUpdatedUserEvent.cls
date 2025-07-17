global class DndUpdatedUserEvent {
	global DndUpdatedUserEvent() { }
	global Object clone() { }
	global Slack.DndUpdatedUserEvent.DndStatus getDndStatus() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setDndStatus(Slack.DndUpdatedUserEvent.DndStatus dndStatus) { }
	global void setEventTs(String eventTs) { }
	global void setUser(String user) { }
	global String toString() { }
global class DndStatus {
	global DndUpdatedUserEvent.DndStatus() { }
	global Object clone() { }
	global Integer getNextDndEndTs() { }
	global Integer getNextDndStartTs() { }
	global Boolean isDndEnabled() { }
	global void setDndEnabled(Boolean dndEnabled) { }
	global void setNextDndEndTs(Integer nextDndEndTs) { }
	global void setNextDndStartTs(Integer nextDndStartTs) { }

}

}