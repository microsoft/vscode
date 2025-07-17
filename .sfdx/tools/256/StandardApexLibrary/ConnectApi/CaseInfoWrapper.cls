global class CaseInfoWrapper {
	global String accountId;
	global Map<String,ConnectApi.GenericObjectWrapper> additionalInfo;
	global String description;
	global String origin;
	global String reason;
	global String status;
	global String subject;
	global CaseInfoWrapper() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}