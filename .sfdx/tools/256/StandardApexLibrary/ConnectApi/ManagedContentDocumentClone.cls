global class ManagedContentDocumentClone {
	global String apiName;
	global ConnectApi.ManagedContentCloneStatus cloneStatus;
	global String contentKey;
	global String errorMessage;
	global List<ConnectApi.ManagedContentFailedVariants> failedVariants;
	global ConnectApi.ManagedContentFolderSummary folder;
	global String managedContentId;
	global String resourceURL;
	global String sourceContentKeyOrId;
	global String title;
	global List<ConnectApi.ManagedContentClonedVariants> variants;
	global ManagedContentDocumentClone() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}