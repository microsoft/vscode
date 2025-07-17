global class FileCreatedEvent {
	global FileCreatedEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global Slack.FileCreatedEvent.File getFile() { }
	global String getFileId() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUserId() { }
	global void setEventTs(String eventTs) { }
	global void setFile(Slack.FileCreatedEvent.File file) { }
	global void setFileId(String fileId) { }
	global void setUserId(String userId) { }
	global String toString() { }
global class File {
	global FileCreatedEvent.File() { }
	global Object clone() { }
	global String getId() { }
	global void setId(String id) { }

}

}