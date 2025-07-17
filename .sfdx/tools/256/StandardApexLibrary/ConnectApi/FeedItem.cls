global class FeedItem {
	global ConnectApi.Actor actor;
	global ConnectApi.FeedItemAttachment attachment;
	global Boolean canShare;
	global ConnectApi.ClientInfo clientInfo;
	global ConnectApi.CommentPage comments;
	global Boolean event;
	global Boolean hasVerifiedComment;
	global Boolean isBookmarkedByCurrentUser;
	global Boolean isDeleteRestricted;
	global Boolean isLikedByCurrentUser;
	global Boolean isSharable;
	global ConnectApi.ChatterLikePage likes;
	global ConnectApi.MessageBody likesMessage;
	global ConnectApi.ModerationFlags moderationFlags;
	global ConnectApi.Reference myLike;
	global ConnectApi.Reference originalFeedItem;
	global ConnectApi.Actor originalFeedItemActor;
	global String photoUrl;
	global ConnectApi.MessageBody preamble;
	global ConnectApi.FeedItemTopicPage topics;
	global ConnectApi.FeedItemType type;
	global ConnectApi.FeedItemVisibilityType visibility;
	global FeedItem() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}