global class CommentPage {
	global List<ConnectApi.Comment> comments;
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.Comment> items;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global Integer total;
	global CommentPage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}