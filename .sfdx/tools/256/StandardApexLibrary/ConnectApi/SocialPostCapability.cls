global class SocialPostCapability {
	global ConnectApi.SocialAccount author;
	global String content;
	global ConnectApi.UserSummary deletedBy;
	global ConnectApi.UserSummary hiddenBy;
	global ConnectApi.Icon icon;
	global String id;
	global Boolean isOutbound;
	global String likedBy;
	global ConnectApi.SocialPostMessageType messageType;
	global String name;
	global String postUrl;
	global ConnectApi.SocialNetworkProvider provider;
	global ConnectApi.SocialAccount recipient;
	global String recipientId;
	global Double reviewScale;
	global Double reviewScore;
	global ConnectApi.SocialPostStatus status;
	global SocialPostCapability() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}