global class UpsertResult {
	global String errorMessage;
	global String externalId;
	global Boolean success;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.UpsertResult failure(String externalId, String errorMessage) { }
	global Integer hashCode() { }
	global static DataSource.UpsertResult success(String externalId) { }

}