global class OrderShipmentItemCollection {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.OrderShipmentItem> items;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global ConnectApi.OrderShipmentItemSort sortOrder;
	global OrderShipmentItemCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}