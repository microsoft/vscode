global class StarsRemoveRequest {
	global static Slack.StarsRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getFile() { }
	global String getFileComment() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global StarsRemoveRequest.Builder() { }
	global Slack.StarsRemoveRequest build() { }
	global Slack.StarsRemoveRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.StarsRemoveRequest.Builder file(String file) { }
	global Slack.StarsRemoveRequest.Builder fileComment(String fileComment) { }
	global Slack.StarsRemoveRequest.Builder timestamp(String timestamp) { }

}

}