global class UserInfo {
	global UserInfo() { }
	global Object clone() { }
	global static String getCurrentUvid() { }
	global static String getDefaultCurrency() { }
	global static String getFirstName() { }
	global static String getLanguage() { }
	global static String getLastName() { }
	global static String getLocale() { }
	global static String getName() { }
	global static String getOrganizationId() { }
	global static String getOrganizationName() { }
	global static String getProfileId() { }
	global static String getSessionId() { }
	global static System.TimeZone getTimeZone() { }
	global static String getUiTheme() { }
	global static String getUiThemeDisplayed() { }
	global static String getUserEmail() { }
	global static String getUserId() { }
	global static String getUserName() { }
	global static String getUserRoleId() { }
	global static String getUserType() { }
	global static Boolean hasPackageLicense(Id packageId) { }
	global static Boolean isCurrentUserLicensed(String namespacePrefix) { }
	global static Boolean isCurrentUserLicensedForPackage(Id packageId) { }
	global static Boolean isMultiCurrencyOrganization() { }

}