global class FileSharedEvent {
	global FileSharedEvent() { }
	global Object clone() { }
	global String getChannelId() { }
	global String getEventTs() { }
	global Slack.FileSharedEvent.File getFile() { }
	global String getFileId() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUserId() { }
	global void setChannelId(String channelId) { }
	global void setEventTs(String eventTs) { }
	global void setFile(Slack.FileSharedEvent.File file) { }
	global void setFileId(String fileId) { }
	global void setUserId(String userId) { }
	global String toString() { }
global class File {
	global FileSharedEvent.File() { }
	global Object clone() { }
	global String getId() { }
	global void setId(String id) { }

}

}