global class Action {
	global Invocable.Action addInvocation() { }
	global Invocable.Action clearInvocations() { }
	global Object clone() { }
	global static Invocable.Action createCustomAction(String type, String namespace, String name) { }
	global static Invocable.Action createCustomAction(String type, String name) { }
	global static Invocable.Action createStandardAction(String type) { }
	global String getName() { }
	global String getNamespace() { }
	global String getType() { }
	global List<Invocable.Action.Result> invoke() { }
	global Boolean isStandard() { }
	global Invocable.Action setInvocationParameter(String parameterName, Object parameterValue) { }
	global Invocable.Action setInvocations(List<Map<String,Object>> invocations) { }
global class Error {
	global Object clone() { }
	global String getCode() { }
	global String getMessage() { }

}
global class Result {
	global Object clone() { }
	global Invocable.Action getAction() { }
	global List<Invocable.Action.Error> getErrors() { }
	global Map<String,Object> getInvocationParameters() { }
	global Map<String,Object> getOutputParameters() { }
	global Boolean isSuccess() { }

}

}