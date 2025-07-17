global class StaticResourceCalloutMock {
	global StaticResourceCalloutMock() { }
	global Object clone() { }
	global System.HttpResponse respond(System.HttpRequest request) { }
	global void setHeader(String key, String val) { }
	global void setStaticResource(String staticResourceName) { }
	global void setStatus(String status) { }
	global void setStatusCode(Integer code) { }

}