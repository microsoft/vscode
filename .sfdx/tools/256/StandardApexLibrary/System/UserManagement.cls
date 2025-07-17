global class UserManagement {
	global UserManagement() { }
	global Object clone() { }
	global static void deregisterVerificationMethod(Id userId, Auth.VerificationMethod method) { }
	global static String formatPhoneNumber(String countryCode, String phoneNumber) { }
	global static String initPasswordlessLogin(Id userId, Auth.VerificationMethod method) { }
	global static String initRegisterVerificationMethod(Auth.VerificationMethod method) { }
	global static String initSelfRegistration(Auth.VerificationMethod method, User u) { }
	global static String initVerificationMethod(Auth.VerificationMethod method, String actionName, Map<String,String> extras) { }
	global static String initVerificationMethod(Auth.VerificationMethod method) { }
	global static void obfuscateUser(Id userId, String username) { }
	global static void obfuscateUser(Id userId) { }
	global static System.PageReference registerVerificationMethod(Auth.VerificationMethod method, String startUrl) { }
	global static Boolean sendAsyncEmailConfirmation(String userId, String emailTemplateId, String networkId, String startUrl) { }
	global static Auth.VerificationResult verifyPasswordlessLogin(Id userId, Auth.VerificationMethod method, String identifier, String code, String startUrl) { }
	global static String verifyRegisterVerificationMethod(String code, Auth.VerificationMethod method) { }
	global static Auth.VerificationResult verifySelfRegistration(Auth.VerificationMethod method, String identifier, String code, String startUrl) { }
	global static Auth.VerificationResult verifyVerificationMethod(String identifier, String code, Auth.VerificationMethod method) { }

}