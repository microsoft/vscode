global class UpsertResult {
	global Boolean created;
	global List<Database.Error> errors;
	global Id id;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global List<Database.Error> getErrors() { }
	global Id getId() { }
	global Integer hashCode() { }
	global Boolean isCreated() { }
	global Boolean isSuccess() { }
	global String toString() { }

}