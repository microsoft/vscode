global class AuthProviderCallbackState {
	global String body;
	global Map<String,String> headers;
	global Map<String,String> queryParameters;
	global AuthProviderCallbackState(Map<String,String> headers, String body, Map<String,String> queryParameters) { }
	global Object clone() { }

}