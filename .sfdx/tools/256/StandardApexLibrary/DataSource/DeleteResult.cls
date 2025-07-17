global class DeleteResult {
	global String errorMessage;
	global String externalId;
	global Boolean success;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.DeleteResult failure(String externalId, String errorMessage) { }
	global Integer hashCode() { }
	global static DataSource.DeleteResult success(String externalId) { }

}