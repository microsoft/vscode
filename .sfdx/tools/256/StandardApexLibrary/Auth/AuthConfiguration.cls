global class AuthConfiguration {
	global AuthConfiguration(Id networkId, String start_URL) { }
	global AuthConfiguration(String URL, String start_URL) { }
	global Object clone() { }
	global Boolean getAllowInternalUserLoginEnabled() { }
	global AuthConfig getAuthConfig() { }
	global List<AuthConfigProviders> getAuthConfigProviders() { }
	global static String getAuthProviderSsoDomainUrl(String communityUrl, String startUrl, String developerName) { }
	global static String getAuthProviderSsoUrl(String communityUrl, String startUrl, String developerName) { }
	global List<AuthProvider> getAuthProviders() { }
	global String getBackgroundColor() { }
	global Boolean getCertificateLoginEnabled(String domainUrl) { }
	global static String getCertificateLoginUrl(String domainUrl, String startUrl) { }
	global Id getDefaultProfileForRegistration() { }
	global Boolean getEmbeddedLoginEnabled() { }
	global String getFooterText() { }
	global String getForgotPasswordUrl() { }
	global Boolean getHeadlessForgotPasswordEnabled() { }
	global Boolean getHeadlessFrgtPswEnabled() { }
	global Boolean getHeadlessPasswordlessLoginEnabled() { }
	global Boolean getHeadlessRegistrationEnabled() { }
	global String getLoginRightFrameUrl() { }
	global String getLogoUrl() { }
	global List<SamlSsoConfig> getSamlProviders() { }
	global static String getSamlSsoUrl(String cUrl, String startUrl, String samlId) { }
	global Boolean getSelfRegistrationEnabled() { }
	global String getSelfRegistrationUrl() { }
	global String getStartUrl() { }
	global Boolean getUsernamePasswordEnabled() { }
	global Boolean isCommunityUsingSiteAsContainer() { }

}