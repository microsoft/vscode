global class SearchAnswer {
	global String content;
	global String llmGenerationId;
	global Map<String,ConnectApi.ObjectMetadata> metadata;
	global List<ConnectApi.SearchObject> searchObjects;
	global SearchAnswer() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}