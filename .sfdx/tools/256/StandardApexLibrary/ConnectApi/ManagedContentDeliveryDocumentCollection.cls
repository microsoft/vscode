global class ManagedContentDeliveryDocumentCollection {
	global ConnectApi.ManagedContentChannelSummary channelInfo;
	global ConnectApi.ManagedContentDeliveryChannelSummaryRepresentation channelSummary;
	global List<ConnectApi.AbstractManagedContentDeliveryDocument> contents;
	global String currentPageUrl;
	global String nextPageUrl;
	global String previousPageUrl;
	global Map<String,ConnectApi.AbstractManagedContentReference> references;
	global List<ConnectApi.AbstractManagedContentReference> referencesList;
	global ManagedContentDeliveryDocumentCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}