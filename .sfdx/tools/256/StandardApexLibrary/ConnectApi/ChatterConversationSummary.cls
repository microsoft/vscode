global class ChatterConversationSummary {
	global String id;
	global ConnectApi.ChatterMessage latestMessage;
	global List<ConnectApi.UserSummary> members;
	global Boolean read;
	global String url;
	global ChatterConversationSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}