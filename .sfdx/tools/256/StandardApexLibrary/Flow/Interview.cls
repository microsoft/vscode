global class Interview {
	global Object clone() { }
	global static Flow.Interview createInterview(String namespace, String flowName, Map<String,Object> inputVariables) { }
	global static Flow.Interview createInterview(String flowName, Map<String,Object> inputVariables) { }
	global Object getVariableValue(String variableName) { }
	global void start() { }

}