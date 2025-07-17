global class AuthProviderPluginClass {
	global AuthProviderPluginClass() { }
	global Object clone() { }
	global Auth.OAuthRefreshResult refresh(Map<String,String> authProviderConfiguration, String refreshToken) { }

}