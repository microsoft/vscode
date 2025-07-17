global class FilesInfoResponse {
	global FilesInfoResponse() { }
	global Object clone() { }
	global String getContent() { }
	global String getContentHighlightCss() { }
	global String getContentHighlightHtml() { }
	global String getError() { }
	global Slack.File getFile() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global Boolean isTruncated() { }
	global void setContent(String content) { }
	global void setContentHighlightCss(String contentHighlightCss) { }
	global void setContentHighlightHtml(String contentHighlightHtml) { }
	global void setError(String error) { }
	global void setFile(Slack.File file) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setTruncated(Boolean truncated) { }
	global void setWarning(String warning) { }
	global String toString() { }

}