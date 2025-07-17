global class FilesRemoteRemoveRequest {
	global static Slack.FilesRemoteRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global String getFile() { }
	global String toString() { }
global class Builder {
	global FilesRemoteRemoveRequest.Builder() { }
	global Slack.FilesRemoteRemoveRequest build() { }
	global Object clone() { }
	global Slack.FilesRemoteRemoveRequest.Builder externalId(String externalId) { }
	global Slack.FilesRemoteRemoveRequest.Builder file(String file) { }

}

}