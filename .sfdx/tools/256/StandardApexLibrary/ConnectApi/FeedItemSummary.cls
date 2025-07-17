global class FeedItemSummary {
	global ConnectApi.FeedElementCapabilities capabilities;
	global ConnectApi.MessageBody header;
	global Datetime modifiedDate;
	global ConnectApi.Reference originalFeedItem;
	global ConnectApi.Actor originalFeedItemActor;
	global String photoUrl;
	global ConnectApi.FeedItemVisibilityType visibility;
	global FeedItemSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}