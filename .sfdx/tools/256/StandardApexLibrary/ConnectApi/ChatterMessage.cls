global class ChatterMessage {
	global ConnectApi.MessageBody body;
	global String conversationId;
	global String conversationUrl;
	global String id;
	global List<ConnectApi.UserSummary> recipients;
	global ConnectApi.UserSummary sender;
	global ConnectApi.Reference sendingCommunity;
	global Datetime sentDate;
	global String url;
	global ChatterMessage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}