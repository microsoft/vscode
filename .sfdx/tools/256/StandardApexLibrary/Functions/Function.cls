global class Function {
	global Object clone() { }
	global static functions.Function get(String namespace, String projectFunctionRef) { }
	global static functions.Function get(String projectFunctionRef) { }
	global functions.FunctionInvocation invoke(String payload, functions.FunctionCallback callback) { }
	global functions.FunctionInvocation invoke(String payload) { }

}