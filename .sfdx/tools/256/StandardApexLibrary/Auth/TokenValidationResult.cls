global class TokenValidationResult {
	global String customErrorMsg;
	global Object data;
	global Boolean isValid;
	global String token;
	global Auth.OAuth2TokenExchangeType tokenType;
	global Auth.UserData userData;
	global TokenValidationResult(Boolean isValid, Object data, Auth.UserData userData, String token, Auth.OAuth2TokenExchangeType tokenType, String customErrorMsg) { }
	global TokenValidationResult(Boolean valid) { }
	global Object clone() { }
	global String getCustomErrorMessage() { }
	global Object getData() { }
	global String getToken() { }
	global Auth.OAuth2TokenExchangeType getTokenType() { }
	global Auth.UserData getUserData() { }
	global Boolean isValid() { }

}