global class ProductChildCollection {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.ProductChild> items;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global ConnectApi.ProductClass productClass;
	global Integer total;
	global ProductChildCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}