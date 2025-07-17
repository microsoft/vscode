global class OrderItemSummaryCollection {
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.OrderItemSummary> items;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global OrderItemSummaryCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}