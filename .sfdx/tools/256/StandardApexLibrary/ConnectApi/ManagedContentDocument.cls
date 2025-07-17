global class ManagedContentDocument {
	global String apiName;
	global Map<String,Object> contentBody;
	global String contentFqn;
	global String contentKey;
	global ConnectApi.ManagedContentSpaceSummary contentSpace;
	global ConnectApi.ManagedContentTypeSummary contentType;
	global ConnectApi.ManagedContentUserSummary createdBy;
	global Datetime createdDate;
	global String externalId;
	global ConnectApi.ManagedContentFolderSummary folder;
	global Boolean isPublished;
	global String language;
	global ConnectApi.ManagedContentUserSummary lastModifiedBy;
	global Datetime lastModifiedDate;
	global String managedContentId;
	global String managedContentVariantId;
	global String managedContentVersionId;
	global ConnectApi.ManagedContentVariantStatusOutput status;
	global String title;
	global String urlName;
	global String versionNumber;
	global ManagedContentDocument() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}