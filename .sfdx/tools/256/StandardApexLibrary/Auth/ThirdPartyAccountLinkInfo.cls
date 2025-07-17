global class ThirdPartyAccountLinkInfo {
	global String handle;
	global String id;
	global Boolean isNotSsoUsable;
	global String provider;
	global String remoteIdentifier;
	global String ssoProviderId;
	global String ssoProviderName;
	global String thirdPartyAccountLinkKey;
	global String userId;
	global ThirdPartyAccountLinkInfo(String oHandle, String oRemoteIdentifier, String oUserId, String oSsoProviderId) { }
	global Object clone() { }

}