global class ManagedContentCollectionMetadata {
	global ConnectApi.ManagedContentChannelSummary channelInfo;
	global ConnectApi.ManagedContentDeliveryChannelSummaryRepresentation channelSummary;
	global String collectionKey;
	global Map<String,Object> collectionMetadata;
	global ConnectApi.ManagedContentTypeSummary collectionType;
	global String id;
	global String language;
	global Datetime publishedDate;
	global Map<String,Object> schema;
	global String title;
	global String urlName;
	global ManagedContentCollectionMetadata() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}