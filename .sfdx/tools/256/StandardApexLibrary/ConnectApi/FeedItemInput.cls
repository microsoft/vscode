global class FeedItemInput {
	global ConnectApi.FeedItemAttachmentInput attachment;
	global ConnectApi.MessageBodyInput body;
	global Boolean isBookmarkedByCurrentUser;
	global String originalFeedElementId;
	global String originalFeedItemId;
	global ConnectApi.FeedItemVisibilityType visibility;
	global FeedItemInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}