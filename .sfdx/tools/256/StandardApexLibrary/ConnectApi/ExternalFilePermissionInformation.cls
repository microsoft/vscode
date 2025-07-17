global class ExternalFilePermissionInformation {
	global List<ConnectApi.ContentHubPermissionType> externalFilePermissionTypes;
	global Boolean externalFilePermissionsFailure;
	global String externalFilePermissionsInfoFailureReason;
	global ConnectApi.ContentHubExternalItemSharingType externalFileSharingStatus;
	global List<ConnectApi.RepositoryGroupSummary> repositoryPublicGroups;
	global ExternalFilePermissionInformation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}