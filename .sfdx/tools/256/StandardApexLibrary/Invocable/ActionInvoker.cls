global class ActionInvoker {
	global ActionInvoker() { }
	global Object clone() { }
	global static Invocable.ActionInvoker.Result invokeCustomAction(String type, String namespace, String name, Map<String,Object> parameters, Double apiVersion) { }
global class Error {
	global String code;
	global String message;
	global ActionInvoker.Error() { }
	global Object clone() { }

}
global class Result {
	global List<Invocable.ActionInvoker.Error> errors;
	global Boolean isSuccess;
	global Map<String,Object> outputParameters;
	global ActionInvoker.Result() { }
	global Object clone() { }

}

}