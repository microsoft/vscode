global class Error {
	global List<String> fields;
	global String message;
	global System.StatusCode statuscode;
	global Boolean equals(Object obj) { }
	global List<String> getFields() { }
	global String getMessage() { }
	global System.StatusCode getStatusCode() { }
	global Integer hashCode() { }
	global String toString() { }

}