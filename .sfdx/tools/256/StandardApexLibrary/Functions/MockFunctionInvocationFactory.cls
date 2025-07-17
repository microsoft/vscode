global class MockFunctionInvocationFactory {
	global MockFunctionInvocationFactory() { }
	global Object clone() { }
	global static functions.FunctionInvocation createErrorResponse(String invocationId, functions.FunctionErrorType functionsErrorType, String errMsg) { }
	global static functions.FunctionInvocation createSuccessResponse(String invocationId, String response) { }

}