global class OrderSummaryCollectionRepresentation {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global String nextPageToken;
	global String nextPageUrl;
	global List<ConnectApi.OrderSummaryRepresentation> orderSummaries;
	global String previousPageToken;
	global String previousPageUrl;
	global ConnectApi.OrderSummarySortOrder sortOrder;
	global OrderSummaryCollectionRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}