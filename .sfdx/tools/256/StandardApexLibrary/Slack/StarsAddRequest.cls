global class StarsAddRequest {
	global static Slack.StarsAddRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getFile() { }
	global String getFileComment() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global StarsAddRequest.Builder() { }
	global Slack.StarsAddRequest build() { }
	global Slack.StarsAddRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.StarsAddRequest.Builder file(String file) { }
	global Slack.StarsAddRequest.Builder fileComment(String fileComment) { }
	global Slack.StarsAddRequest.Builder timestamp(String timestamp) { }

}

}