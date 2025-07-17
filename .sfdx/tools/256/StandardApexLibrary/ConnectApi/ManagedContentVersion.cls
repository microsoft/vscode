global class ManagedContentVersion {
	global ConnectApi.ManagedContentAssociations associations;
	global String contentKey;
	global Map<String,ConnectApi.ManagedContentNodeValue> contentNodes;
	global String contentUrlName;
	global String language;
	global String managedContentId;
	global Datetime publishedDate;
	global String title;
	global String type;
	global String typeLabel;
	global String unauthenticatedUrl;
	global ManagedContentVersion() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}