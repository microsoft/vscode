global class FeedElement {
	global ConnectApi.FeedBody body;
	global ConnectApi.FeedElementCapabilities capabilities;
	global Datetime createdDate;
	global ConnectApi.FeedElementType feedElementType;
	global ConnectApi.MessageBody header;
	global String id;
	global Datetime modifiedDate;
	global ConnectApi.ActorWithId parent;
	global String relativeCreatedDate;
	global String url;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}