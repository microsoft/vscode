global class Continuation {
	global String ContinuationMethod;
	global Integer Timeout;
	global Object state;
	global Continuation(Integer timeoutInSecs) { }
	global String addHttpRequest(System.HttpRequest request) { }
	global Object clone() { }
	global Map<String,System.HttpRequest> getRequests() { }
	global static System.HttpResponse getResponse(String label) { }
	global String toString() { }

}