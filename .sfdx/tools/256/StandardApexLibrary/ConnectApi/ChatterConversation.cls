global class ChatterConversation {
	global String conversationId;
	global String conversationUrl;
	global List<ConnectApi.UserSummary> members;
	global ConnectApi.ChatterMessagePage messages;
	global Boolean read;
	global ChatterConversation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}