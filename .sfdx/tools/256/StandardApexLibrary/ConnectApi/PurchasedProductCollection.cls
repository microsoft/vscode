global class PurchasedProductCollection {
	global String currentPageToken;
	global String currentPageUrl;
	global String nextPageToken;
	global String nextPageUrl;
	global Integer pageSize;
	global String previousPageToken;
	global String previousPageUrl;
	global List<ConnectApi.PurchasedProductSummaryOutput> products;
	global PurchasedProductCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}