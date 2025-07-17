global class Comment {
	global ConnectApi.FeedItemAttachment attachment;
	global ConnectApi.FeedBody body;
	global ConnectApi.CommentCapabilities capabilities;
	global ConnectApi.ClientInfo clientInfo;
	global Datetime createdDate;
	global ConnectApi.Reference feedElement;
	global ConnectApi.Reference feedItem;
	global String id;
	global Boolean isDeleteRestricted;
	global ConnectApi.ChatterLikePage likes;
	global ConnectApi.MessageBody likesMessage;
	global ConnectApi.ModerationFlags moderationFlags;
	global ConnectApi.Reference myLike;
	global ConnectApi.Reference parent;
	global String relativeCreatedDate;
	global Integer threadLevel;
	global String threadParentId;
	global ConnectApi.CommentType type;
	global String url;
	global ConnectApi.UserSummary user;
	global Comment() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}