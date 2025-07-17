global class ManagedContentCollectionDetailRepresentation {
	global String collectionKey;
	global ConnectApi.ManagedContentTypeSummary collectionType;
	global String currentPageUrl;
	global String id;
	global Boolean isPublished;
	global List<ConnectApi.ManagedContentCollectionItem> items;
	global String language;
	global String nextPageUrl;
	global String previousPageUrl;
	global String title;
	global Integer total;
	global String urlName;
	global String versionNumber;
	global ManagedContentCollectionDetailRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}