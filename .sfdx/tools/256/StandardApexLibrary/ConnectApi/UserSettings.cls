global class UserSettings {
	global Boolean approvalPosts;
	global Boolean canAccessPersonalStreams;
	global Boolean canFollow;
	global Boolean canModifyAllData;
	global Boolean canOwnGroups;
	global Boolean canViewAllData;
	global Boolean canViewAllGroups;
	global Boolean canViewAllUsers;
	global Boolean canViewCommunitySwitcher;
	global Boolean canViewFullUserProfile;
	global Boolean canViewPublicFiles;
	global String currencySymbol;
	global Boolean externalUser;
	global Integer fileSyncLimit;
	global Integer fileSyncStorageLimit;
	global Integer folderSyncLimit;
	global Boolean hasAccessToInternalOrg;
	global Boolean hasChatter;
	global Boolean hasFieldServiceLocationTracking;
	global Boolean hasFieldServiceMobileAccess;
	global Boolean hasFileSync;
	global Boolean hasFileSyncManagedClientAutoUpdate;
	global Boolean hasRestDataApiAccess;
	global ConnectApi.TimeZone timeZone;
	global String userDefaultCurrencyIsoCode;
	global String userId;
	global String userLocale;
	global UserSettings() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}