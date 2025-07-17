global class SiteSearchResult {
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.SiteSearchItem> items;
	global String language;
	global String nextPageToken;
	global String nextPageUrl;
	global Integer pageSize;
	global String previousPageToken;
	global String previousPageUrl;
	global Integer totalItems;
	global SiteSearchResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}