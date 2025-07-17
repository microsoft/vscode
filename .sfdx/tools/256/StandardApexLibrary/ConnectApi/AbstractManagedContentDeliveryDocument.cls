global class AbstractManagedContentDeliveryDocument {
	global String contentKey;
	global ConnectApi.ManagedContentTypeSummary contentType;
	global String language;
	global String managedContentId;
	global Datetime publishedDate;
	global String resourceUrl;
	global String title;
	global String unauthenticatedUrl;
	global String urlName;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}