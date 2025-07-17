global class FileChangeEvent {
	global FileChangeEvent() { }
	global Object clone() { }
	global Slack.FileChangeEvent.File getFile() { }
	global String getFileId() { }
	global String getSubtype() { }
	global String getType() { }
	global void setFile(Slack.FileChangeEvent.File file) { }
	global void setFileId(String fileId) { }
	global String toString() { }
global class File {
	global FileChangeEvent.File() { }
	global Object clone() { }
	global String getId() { }
	global void setId(String id) { }

}

}