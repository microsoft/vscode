global class LoginFormController {
	global Object clone() { }
	global static String getForgotPasswordUrl() { }
	global static Boolean getIsSelfRegistrationEnabled() { }
	global static Boolean getIsUsernamePasswordEnabled() { }
	global static String getLoginRightFrameUrl() { }
	global static String getSelfRegistrationUrl() { }
	global static Map<String,Boolean> getUsernamePasswordSelfRegEnabled() { }
	global static String login(String username, String password, String startUrl) { }
	global static String loginGetPageRefUrl(String username, String password, String startUrl) { }
	global static String setExperienceId(String expId) { }

}