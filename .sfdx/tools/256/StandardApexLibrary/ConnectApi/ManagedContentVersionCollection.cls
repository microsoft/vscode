global class ManagedContentVersionCollection {
	global String currentPageUrl;
	global List<ConnectApi.ManagedContentVersion> items;
	global Map<String,ConnectApi.ManagedContentType> managedContentTypes;
	global String nextPageUrl;
	global Integer total;
	global Integer totalTypes;
	global ManagedContentVersionCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}