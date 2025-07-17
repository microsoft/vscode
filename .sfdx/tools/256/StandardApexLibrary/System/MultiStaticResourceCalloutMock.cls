global class MultiStaticResourceCalloutMock {
	global MultiStaticResourceCalloutMock() { }
	global Object clone() { }
	global System.HttpResponse respond(System.HttpRequest request) { }
	global void setHeader(String key, String val) { }
	global void setStaticResource(String url, String staticResourceName) { }
	global void setStatus(String status) { }
	global void setStatusCode(Integer code) { }

}