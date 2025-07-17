global class JWTBearerTokenExchange {
	global JWTBearerTokenExchange(String tokenEndpoint, Auth.JWS jws) { }
	global JWTBearerTokenExchange() { }
	global Object clone() { }
	global String getAccessToken() { }
	global String getGrantType() { }
	global System.HttpResponse getHttpResponse() { }
	global Auth.JWS getJWS() { }
	global String getTokenEndpoint() { }
	global void setGrantType(String grantType) { }
	global void setJWS(Auth.JWS jws) { }
	global void setTokenEndpoint(String tokenEndpoint) { }
global class JWTBearerTokenExchangeException extends Exception {
	global JWTBearerTokenExchange.JWTBearerTokenExchangeException(String param0, Exception param1) { }
	global JWTBearerTokenExchange.JWTBearerTokenExchangeException(Exception param0) { }
	global JWTBearerTokenExchange.JWTBearerTokenExchangeException(String param0) { }
	global JWTBearerTokenExchange.JWTBearerTokenExchangeException() { }
	global Object clone() { }
	global String getTypeName() { }

}

}