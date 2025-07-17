global class FindDuplicatesResult {
	global List<Datacloud.DuplicateResult> duplicateresults;
	global List<Database.Error> errors;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global List<Datacloud.DuplicateResult> getDuplicateResults() { }
	global List<Database.Error> getErrors() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}