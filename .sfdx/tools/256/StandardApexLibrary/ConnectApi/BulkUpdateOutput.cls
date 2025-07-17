global class BulkUpdateOutput {
	global String backgroundOperationId;
	global String bulkUpdateId;
	global List<ConnectApi.bulkUpdateErrorResponse> errorDetails;
	global Boolean isSuccess;
	global List<String> updatedRecordIds;
	global BulkUpdateOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}