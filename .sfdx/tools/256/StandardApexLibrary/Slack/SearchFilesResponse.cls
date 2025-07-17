global class SearchFilesResponse {
	global SearchFilesResponse() { }
	global Object clone() { }
	global String getError() { }
	global Slack.SearchResult getFiles() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getQuery() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setFiles(Slack.SearchResult files) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setQuery(String query) { }
	global void setWarning(String warning) { }
	global String toString() { }

}