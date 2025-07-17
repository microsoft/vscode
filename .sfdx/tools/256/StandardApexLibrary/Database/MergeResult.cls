global class MergeResult {
	global List<Database.Error> errors;
	global Id id;
	global List<String> mergedrecordids;
	global Boolean success;
	global List<String> updatedrelatedids;
	global Boolean equals(Object obj) { }
	global List<Database.Error> getErrors() { }
	global Id getId() { }
	global List<String> getMergedRecordIds() { }
	global List<String> getUpdatedRelatedIds() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}