global class ChatterLikePage {
	global Integer currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.ChatterLike> items;
	global List<ConnectApi.ChatterLike> likes;
	global Integer nextPageToken;
	global String nextPageUrl;
	global Integer previousPageToken;
	global String previousPageUrl;
	global Integer total;
	global ChatterLikePage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}