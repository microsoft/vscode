global class ReactionsGetRequest {
	global static Slack.ReactionsGetRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getFile() { }
	global String getFileComment() { }
	global String getTimestamp() { }
	global Boolean isFull() { }
	global String toString() { }
global class Builder {
	global ReactionsGetRequest.Builder() { }
	global Slack.ReactionsGetRequest build() { }
	global Slack.ReactionsGetRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ReactionsGetRequest.Builder file(String file) { }
	global Slack.ReactionsGetRequest.Builder fileComment(String fileComment) { }
	global Slack.ReactionsGetRequest.Builder full(Boolean full) { }
	global Slack.ReactionsGetRequest.Builder timestamp(String timestamp) { }

}

}