global class RestResponse {
	global Map<String,String> headers;
	global Blob responseBody;
	global Integer statusCode;
	global RestResponse() { }
	global void addHeader(String name, String value) { }
	global Object clone() { }

}