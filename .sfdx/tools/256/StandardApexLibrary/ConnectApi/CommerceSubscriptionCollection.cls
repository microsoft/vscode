global class CommerceSubscriptionCollection {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global ConnectApi.CommerceSubscriptionSortOrder sortOrder;
	global List<ConnectApi.CommerceSubscriptionDetail> subscriptions;
	global CommerceSubscriptionCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}