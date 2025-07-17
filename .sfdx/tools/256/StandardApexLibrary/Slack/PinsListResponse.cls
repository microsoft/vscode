global class PinsListResponse {
	global PinsListResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<Slack.PinsListResponse.MessageItem> getItems() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setItems(List<Slack.PinsListResponse.MessageItem> items) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class MessageItem {
	global PinsListResponse.MessageItem() { }
	global Object clone() { }
	global String getChannel() { }
	global String getComment() { }
	global Integer getCreated() { }
	global String getCreatedBy() { }
	global Slack.File getFile() { }
	global Slack.Message getMessage() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setComment(String comment) { }
	global void setCreated(Integer created) { }
	global void setCreatedBy(String createdBy) { }
	global void setFile(Slack.File file) { }
	global void setMessage(Slack.Message message) { }
	global void setType(String type) { }

}

}