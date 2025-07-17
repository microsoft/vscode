global class SocialLoginController {
	global SocialLoginController() { }
	global Object clone() { }
	global static List<AuthProvider> getAuthProviders() { }
	global static String getCommunityDomainSsoUrl(String startUrl, String developerName) { }
	global static List<SamlSsoConfig> getSamlProviders() { }
	global static String getSamlSsoUrl(String startUrl, String samlId) { }
	global static String getSamlSsoUrlNoCache(String startUrl, String samlId) { }
	global static String getSsoUrl(String startUrl, String developerName) { }
	global static String handleIdp() { }

}