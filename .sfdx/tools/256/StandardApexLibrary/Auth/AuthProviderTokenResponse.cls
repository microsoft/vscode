global class AuthProviderTokenResponse {
	global String idToken;
	global String oauthSecretOrRefreshToken;
	global String oauthToken;
	global String provider;
	global String state;
	global AuthProviderTokenResponse(String provider, String oauthToken, String oauthSecretOrRefreshToken, String state, String idToken) { }
	global AuthProviderTokenResponse(String provider, String oauthToken, String oauthSecretOrRefreshToken, String state) { }
	global Object clone() { }

}