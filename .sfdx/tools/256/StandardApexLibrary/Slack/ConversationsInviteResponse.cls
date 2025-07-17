global class ConversationsInviteResponse {
	global ConversationsInviteResponse() { }
	global Object clone() { }
	global Slack.Conversation getChannel() { }
	global String getError() { }
	global List<Slack.ConversationsInviteResponse.Error> getErrors() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setChannel(Slack.Conversation channel) { }
	global void setError(String error) { }
	global void setErrors(List<Slack.ConversationsInviteResponse.Error> errors) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Error {
	global ConversationsInviteResponse.Error() { }
	global Object clone() { }
	global String getError() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setOk(Boolean ok) { }

}

}