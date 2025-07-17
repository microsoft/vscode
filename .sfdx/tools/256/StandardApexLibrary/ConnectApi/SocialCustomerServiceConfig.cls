global class SocialCustomerServiceConfig {
	global String inboundApexHandlerId;
	global Boolean isAllFBResponseAccountsEnabled;
	global Boolean isInboundParentPostEnabled;
	global Boolean isInboundProcessingConcurrencyEnabled;
	global Boolean isPackageInstalled;
	global Boolean isSocialPublishingApprovalEnabled;
	global Boolean isTenantConnectionValid;
	global Integer managedSocialAccountCount;
	global Integer managedSocialAccountLimit;
	global List<ConnectApi.SocialCustomerServiceProviderSettings> providerSettings;
	global String runAsUserId;
	global String setupTenantUrl;
	global String tenantType;
	global SocialCustomerServiceConfig() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}