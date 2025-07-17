global class CommentInput {
	global ConnectApi.FeedItemAttachmentInput attachment;
	global ConnectApi.MessageBodyInput body;
	global ConnectApi.CommentCapabilitiesInput capabilities;
	global ConnectApi.ExtensionsCapabilityInput extensions;
	global String threadParentId;
	global CommentInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}