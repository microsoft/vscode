global class AuthRequestResponse {
	global AuthRequestResponse(String accessToken, String contextRecordId, String authProviderName) { }
	global Object clone() { }
	global String getAccessToken() { }
	global String getAuthProviderName() { }
	global String getContextRecordId() { }

}