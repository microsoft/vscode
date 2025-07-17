global interface FunctionInvocation {
	functions.FunctionInvocationError getError();
	String getInvocationId();
	String getResponse();
	functions.FunctionInvocationStatus getStatus();

}