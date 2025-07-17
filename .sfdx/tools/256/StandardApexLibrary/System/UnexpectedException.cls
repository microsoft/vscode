global class UnexpectedException extends Exception {
	global UnexpectedException(String param0, Exception param1) { }
	global UnexpectedException(Exception param0) { }
	global UnexpectedException(String param0) { }
	global UnexpectedException() { }
	global Boolean equals(Object obj) { }
	global Exception getCause() { }
	global Map<String,Set<String>> getInaccessibleFields() { }
	global Integer getLineNumber() { }
	global String getMessage() { }
	global String getStackTraceString() { }
	global String getTypeName() { }
	global Integer hashCode() { }
	global void initCause(Exception cause) { }
	global void setMessage(String message) { }
	global String toString() { }

}