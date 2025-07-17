global class Suggestions {
	global Map<String,ConnectApi.ObjectMetadata> metadata;
	global ConnectApi.QueryInfo queryInfo;
	global List<ConnectApi.AbstractSuggestion> suggestions;
	global Suggestions() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}