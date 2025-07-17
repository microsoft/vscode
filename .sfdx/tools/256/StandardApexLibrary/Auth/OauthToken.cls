global class OauthToken {
	global OauthToken() { }
	global Object clone() { }
	global static Boolean revokeToken(Auth.OauthTokenType type, String authToken) { }

}