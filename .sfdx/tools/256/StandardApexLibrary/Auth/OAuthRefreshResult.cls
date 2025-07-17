global class OAuthRefreshResult {
	global String accessToken;
	global String error;
	global String refreshToken;
	global OAuthRefreshResult(String accessToken, String refreshToken, String error) { }
	global OAuthRefreshResult(String accessToken, String refreshToken) { }
	global Object clone() { }

}