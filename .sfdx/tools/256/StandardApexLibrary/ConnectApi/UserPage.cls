global class UserPage {
	global Integer currentPageToken;
	global String currentPageUrl;
	global Integer nextPageToken;
	global String nextPageUrl;
	global Integer previousPageToken;
	global String previousPageUrl;
	global List<ConnectApi.UserDetail> users;
	global UserPage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}