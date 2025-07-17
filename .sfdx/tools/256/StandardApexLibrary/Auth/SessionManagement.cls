global class SessionManagement {
	global SessionManagement() { }
	global Object clone() { }
	global static System.PageReference finishLoginDiscovery(Auth.LoginDiscoveryMethod method, Id userId) { }
	global static System.PageReference finishLoginFlow(String startUrl) { }
	global static System.PageReference finishLoginFlow() { }
	global static String generateVerificationUrl(Auth.VerificationPolicy policy, String description, String retUrl) { }
	global static Map<String,String> getCurrentSession() { }
	global static Auth.LightningLoginEligibility getLightningLoginEligibility(Id userId) { }
	global static Map<String,String> getQrCode() { }
	global static Auth.SessionLevel getRequiredSessionLevelForProfile(String profileId) { }
	global static Map<String,String> ignoreForConcurrentSessionLimit(Object sessions) { }
	global static Boolean inOrgNetworkRange(String ipAddress) { }
	global static Boolean isIpAllowedForProfile(String profileId, String ipAddress) { }
	global static void setSessionLevel(Auth.SessionLevel level) { }
	global static Boolean validateTotpTokenForKey(String totpSharedKey, String totpCode, String description) { }
	global static Boolean validateTotpTokenForKey(String totpSharedKey, String totpCode) { }
	global static Boolean validateTotpTokenForUser(String totpCode, String description) { }
	global static Boolean validateTotpTokenForUser(String totpCode) { }
	global static System.PageReference verifyDeviceFlow(String userCode, String startUrl) { }

}