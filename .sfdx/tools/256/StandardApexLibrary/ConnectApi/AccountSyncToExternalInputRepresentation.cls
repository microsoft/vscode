global class AccountSyncToExternalInputRepresentation {
	global String adServerAccountId;
	global List<String> contactIds;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> customFields;
	global List<String> fieldsToSend;
	global String requestMode;
	global AccountSyncToExternalInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}