global class Feed {
	global String feedElementPostUrl;
	global ConnectApi.FeedElementPage feedElements;
	global String feedElementsUrl;
	global String feedItemsUrl;
	global String isModifiedUrl;
	global String pinnedFeedElementsUrl;
	global ConnectApi.FeedFilter redirectedFeedFilter;
	global ConnectApi.FeedSortOrder redirectedFeedSort;
	global ConnectApi.FeedType redirectedFeedType;
	global Boolean respectsMute;
	global Feed() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}