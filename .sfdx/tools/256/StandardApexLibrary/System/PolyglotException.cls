global class PolyglotException extends Exception {
	global PolyglotException(String param0, Exception param1) { }
	global PolyglotException(Exception param0) { }
	global PolyglotException(String param0) { }
	global PolyglotException() { }
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