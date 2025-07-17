global class EmailException extends Exception {
	global EmailException(String param0, Exception param1) { }
	global EmailException(Exception param0) { }
	global EmailException(String param0) { }
	global EmailException() { }
	global Boolean equals(Object obj) { }
	global Exception getCause() { }
	global List<String> getDmlFieldNames(Integer index) { }
	global List<Schema.SObjectField> getDmlFields(Integer index) { }
	global String getDmlId(Integer index) { }
	global Integer getDmlIndex(Integer index) { }
	global String getDmlMessage(Integer index) { }
	global String getDmlStatusCode(Integer index) { }
	global System.StatusCode getDmlType(Integer index) { }
	global Map<String,Set<String>> getInaccessibleFields() { }
	global Integer getLineNumber() { }
	global String getMessage() { }
	global Integer getNumDml() { }
	global String getStackTraceString() { }
	global String getTypeName() { }
	global Integer hashCode() { }
	global void initCause(Exception cause) { }
	global void setMessage(String message) { }
	global String toString() { }

}