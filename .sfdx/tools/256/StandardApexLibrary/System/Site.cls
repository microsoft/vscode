global class Site {
	global Site() { }
	global static System.PageReference changePassword(String newPassword, String verifyNewPassword, String oldPassword) { }
	global static System.PageReference changePassword(String newPassword, String verifyNewPassword) { }
	global Object clone() { }
	global static Id createExternalUser(SObject user, String accountId, String password, Boolean sendEmailConfirmation) { }
	global static Id createExternalUser(SObject user, String accountId, String password) { }
	global static Id createExternalUser(SObject user, String accountId) { }
	global static Id createPersonAccountPortalUser(SObject user, String ownerId, String recordTypeId, String password) { }
	global static Id createPersonAccountPortalUser(SObject user, String ownerId, String password) { }
	global static Id createPortalUser(SObject user, String accountId, String password, Boolean sendEmailConfirmation) { }
	global static Id createPortalUser(SObject user, String accountId, String password) { }
	global static Id createPortalUser(SObject user, String accountId) { }
	global static Boolean forgotPassword(String username, String emailTemplateName) { }
	global static Boolean forgotPassword(String username) { }
	global static String getAdminEmail() { }
	global static Id getAdminId() { }
	global static String getAnalyticsTrackingCode() { }
	global static String getBaseCustomUrl() { }
	global static String getBaseInsecureUrl() { }
	global static String getBaseRequestUrl() { }
	global static String getBaseSecureUrl() { }
	global static String getBaseUrl() { }
	global static String getCurrentSiteUrl() { }
	global static String getCustomWebAddress() { }
	global static String getDomain() { }
	global static String getErrorDescription() { }
	global static String getErrorMessage() { }
	global static String getExperienceId() { }
	global static String getMasterLabel() { }
	global static String getName() { }
	global static String getOriginalUrl() { }
	global static String getPasswordPolicyStatement() { }
	global static String getPathPrefix() { }
	global static String getPrefix() { }
	global static Id getSiteId() { }
	global static String getSiteType() { }
	global static String getSiteTypeLabel() { }
	global static System.PageReference getTemplate() { }
	global static Boolean isLoginEnabled() { }
	global static Boolean isPasswordExpired() { }
	global static Boolean isRegistrationEnabled() { }
	global static Boolean isValidUsername(String username) { }
	global static System.PageReference login(String username, String password, String startUrl) { }
	global static System.PageReference passwordlessLogin(Id userId, List<Auth.VerificationMethod> methods, String startUrl) { }
	global static void setExperienceId(String expIdValue) { }
	global static void setPortalUserAsAuthProvider(SObject user, String accountId) { }
	global static void validatePassword(SObject user, String password, String confirmPassword) { }

}