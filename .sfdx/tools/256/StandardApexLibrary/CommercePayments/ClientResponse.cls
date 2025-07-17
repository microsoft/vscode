global class ClientResponse {
	global ClientResponse(String token, Map<String,Object> response) { }
	global Object clone() { }
	global String getGatewayToken() { }
	global Map<String,Object> getResponseBody() { }
	global void setGatewayToken(String token) { }
	global void setResponseBody(Map<String,Object> response) { }

}