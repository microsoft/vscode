global class ManagedContentDeliveryDocument {
	global ConnectApi.ManagedContentChannelSummary channelInfo;
	global ConnectApi.ManagedContentDeliveryChannelSummaryRepresentation channelSummary;
	global Map<String,Object> contentBody;
	global Map<String,ConnectApi.AbstractManagedContentReference> references;
	global List<ConnectApi.AbstractManagedContentReference> referencesList;
	global ManagedContentDeliveryDocument() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}