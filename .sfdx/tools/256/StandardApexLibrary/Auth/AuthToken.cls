global class AuthToken {
	global AuthToken() { }
	global Object clone() { }
	global static String getAccessToken(String authProviderId, String providerName) { }
	global static Map<String,String> getAccessTokenMap(String authProviderId, String providerName) { }
	global static Map<String,String> refreshAccessToken(String authProviderId, String providerName, String oldAccessToken) { }
	global static Boolean revokeAccess(String authProviderId, String providerName, String userId, String remoteIdentifier) { }

}