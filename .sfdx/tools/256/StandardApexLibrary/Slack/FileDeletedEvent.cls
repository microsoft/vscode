global class FileDeletedEvent {
	global FileDeletedEvent() { }
	global Object clone() { }
	global List<String> getChannelIds() { }
	global String getEventTs() { }
	global String getFileId() { }
	global String getSubtype() { }
	global String getType() { }
	global void setChannelIds(List<String> channelIds) { }
	global void setEventTs(String eventTs) { }
	global void setFileId(String fileId) { }
	global String toString() { }

}