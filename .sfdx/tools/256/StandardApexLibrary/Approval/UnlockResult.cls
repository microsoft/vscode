global class UnlockResult {
	global List<Database.Error> errors;
	global Id id;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global List<Database.Error> getErrors() { }
	global Id getId() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}