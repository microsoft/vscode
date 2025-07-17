global class FilesListResponse {
	global FilesListResponse() { }
	global Object clone() { }
	global String getError() { }
	global List<Slack.File> getFiles() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global Slack.Paging getPaging() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setFiles(List<Slack.File> files) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setPaging(Slack.Paging paging) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }

}