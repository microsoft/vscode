global class SearchAllResponse {
	global SearchAllResponse() { }
	global Object clone() { }
	global String getError() { }
	global Slack.SearchResult getFiles() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global Slack.SearchResult getMessages() { }
	global String getNeeded() { }
	global Slack.SearchAllResponse.Posts getPosts() { }
	global String getProvided() { }
	global String getQuery() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setFiles(Slack.SearchResult files) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setMessages(Slack.SearchResult messages) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPosts(Slack.SearchAllResponse.Posts posts) { }
	global void setProvided(String provided) { }
	global void setQuery(String query) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Posts {
	global SearchAllResponse.Posts() { }
	global Object clone() { }
	global List<String> getMatches() { }
	global Integer getTotal() { }
	global void setMatches(List<String> matches) { }
	global void setTotal(Integer total) { }

}

}