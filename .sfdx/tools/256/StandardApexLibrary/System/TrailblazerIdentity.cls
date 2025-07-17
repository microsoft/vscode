global class TrailblazerIdentity {
	global TrailblazerIdentity() { }
	global Object clone() { }
	global static String generateUserEmailVerificationToken(String orgId, String userId, String email) { }
	global static List<Auth.UserOrgInfo> getUserOrgInfo(List<String> emailList) { }
	global static void splunkLog(String source, String message) { }

}