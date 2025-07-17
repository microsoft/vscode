global class TrackedCommunicationOutput {
	global List<String> categories;
	global String communicatorReference;
	global String contextReference;
	global List<String> mediums;
	global String name;
	global List<String> notes;
	global Datetime occurrenceEndDateTime;
	global Datetime occurrenceStartDateTime;
	global List<ConnectApi.PayLoadOutputRepresentation> payloads;
	global String priority;
	global List<String> reasonCodes;
	global List<String> recipients;
	global List<String> replacedItems;
	global String requesterReference;
	global String status;
	global String statusReason;
	global String subject;
	global String type;
	global TrackedCommunicationOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}