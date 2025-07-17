global class FilePublicEvent {
	global FilePublicEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global Slack.FilePublicEvent.File getFile() { }
	global String getFileId() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUserId() { }
	global void setEventTs(String eventTs) { }
	global void setFile(Slack.FilePublicEvent.File file) { }
	global void setFileId(String fileId) { }
	global void setUserId(String userId) { }
	global String toString() { }
global class File {
	global FilePublicEvent.File() { }
	global Object clone() { }
	global String getId() { }
	global void setId(String id) { }

}

}