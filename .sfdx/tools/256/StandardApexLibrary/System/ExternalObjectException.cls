global class ExternalObjectException extends Exception {
	global ExternalObjectException(String param0, Exception param1) { }
	global ExternalObjectException(Exception param0) { }
	global ExternalObjectException(String param0) { }
	global ExternalObjectException() { }
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