global class RestRequest {
	global Map<String,String> headers;
	global String httpMethod;
	global Map<String,String> params;
	global String remoteAddress;
	global Blob requestBody;
	global String requestURI;
	global String resourcePath;
	global RestRequest() { }
	global void addHeader(String name, String value) { }
	global void addParameter(String name, String value) { }
	global Object clone() { }

}