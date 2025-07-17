global class ModerationFlagsCollection {
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.ModerationFlagItemDetail> flags;
	global String nextPageToken;
	global String nextPageUrl;
	global Integer pageSize;
	global ModerationFlagsCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}