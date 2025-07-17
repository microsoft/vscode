global class OrderShipmentCollection {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global List<ConnectApi.OrderShipment> shipments;
	global ConnectApi.OrderShipmentSort sortOrder;
	global OrderShipmentCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}