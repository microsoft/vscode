global class ApiTestResponse {
	global ApiTestResponse() { }
	global Object clone() { }
	global Slack.ApiTestResponse.Args getArgs() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setArgs(Slack.ApiTestResponse.Args args) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Args {
	global ApiTestResponse.Args() { }
	global Object clone() { }
	global String getError() { }
	global String getFoo() { }
	global void setError(String error) { }
	global void setFoo(String foo) { }

}

}