global class VotePage {
	global Integer currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.Vote> items;
	global Integer nextPageToken;
	global String nextPageUrl;
	global Integer previousPageToken;
	global String previousPageUrl;
	global Long total;
	global VotePage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}