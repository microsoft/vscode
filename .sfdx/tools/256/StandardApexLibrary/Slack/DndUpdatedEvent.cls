global class DndUpdatedEvent {
	global DndUpdatedEvent() { }
	global Object clone() { }
	global Slack.DndUpdatedEvent.DndStatus getDndStatus() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setDndStatus(Slack.DndUpdatedEvent.DndStatus dndStatus) { }
	global void setEventTs(String eventTs) { }
	global void setUser(String user) { }
	global String toString() { }
global class DndStatus {
	global DndUpdatedEvent.DndStatus() { }
	global Object clone() { }
	global Integer getNextDndEndTs() { }
	global Integer getNextDndStartTs() { }
	global Integer getSnoozeEndtime() { }
	global Integer getSnoozeRemaining() { }
	global Boolean isDndEnabled() { }
	global Boolean isSnoozeEnabled() { }
	global void setDndEnabled(Boolean dndEnabled) { }
	global void setNextDndEndTs(Integer nextDndEndTs) { }
	global void setNextDndStartTs(Integer nextDndStartTs) { }
	global void setSnoozeEnabled(Boolean snoozeEnabled) { }
	global void setSnoozeEndtime(Integer snoozeEndtime) { }
	global void setSnoozeRemaining(Integer snoozeRemaining) { }

}

}