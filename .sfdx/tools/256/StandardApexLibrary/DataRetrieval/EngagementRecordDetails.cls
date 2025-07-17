global class EngagementRecordDetails {
	global String conversationIdentifier;
	global Datetime endDateTime;
	global String recordId;
	global Datetime startDateTime;
	global EngagementRecordDetails(String recordId, String conversationIdentifier, Datetime startDateTime, Datetime endDateTime) { }
	global EngagementRecordDetails() { }
	global Object clone() { }

}