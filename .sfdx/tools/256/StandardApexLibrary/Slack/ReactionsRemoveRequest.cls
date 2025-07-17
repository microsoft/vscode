global class ReactionsRemoveRequest {
	global static Slack.ReactionsRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getFile() { }
	global String getFileComment() { }
	global String getName() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global ReactionsRemoveRequest.Builder() { }
	global Slack.ReactionsRemoveRequest build() { }
	global Slack.ReactionsRemoveRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ReactionsRemoveRequest.Builder file(String file) { }
	global Slack.ReactionsRemoveRequest.Builder fileComment(String fileComment) { }
	global Slack.ReactionsRemoveRequest.Builder name(String name) { }
	global Slack.ReactionsRemoveRequest.Builder timestamp(String timestamp) { }

}

}