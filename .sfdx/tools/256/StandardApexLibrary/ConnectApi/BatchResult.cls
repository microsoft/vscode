global class BatchResult {
	global Exception error;
	global String errorMessage;
	global String errorTypeName;
	global Boolean isSuccess;
	global Object result;
	global BatchResult(Object result, Exception error) { }
	global Object clone() { }
	global Exception getError() { }
	global String getErrorMessage() { }
	global String getErrorTypeName() { }
	global Object getResult() { }
	global Boolean isSuccess() { }
	global String toString() { }

}