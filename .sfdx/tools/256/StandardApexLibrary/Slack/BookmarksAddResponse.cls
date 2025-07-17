global class BookmarksAddResponse {
	global BookmarksAddResponse() { }
	global Object clone() { }
	global Slack.Bookmark getBookmark() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ErrorResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setBookmark(Slack.Bookmark bookmark) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ErrorResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}