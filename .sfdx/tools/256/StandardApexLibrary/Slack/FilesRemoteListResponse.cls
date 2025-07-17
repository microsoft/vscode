global class FilesRemoteListResponse {
	global FilesRemoteListResponse() { }
	global Object clone() { }
	global String getError() { }
	global List<Slack.File> getFiles() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Slack.ResponseMetadata getResponseMetadata() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setFiles(List<Slack.File> files) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setResponseMetadata(Slack.ResponseMetadata responseMetadata) { }
	global void setWarning(String warning) { }
	global String toString() { }

}