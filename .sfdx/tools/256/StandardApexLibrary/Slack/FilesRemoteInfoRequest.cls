global class FilesRemoteInfoRequest {
	global static Slack.FilesRemoteInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global String getFile() { }
	global String toString() { }
global class Builder {
	global FilesRemoteInfoRequest.Builder() { }
	global Slack.FilesRemoteInfoRequest build() { }
	global Object clone() { }
	global Slack.FilesRemoteInfoRequest.Builder externalId(String externalId) { }
	global Slack.FilesRemoteInfoRequest.Builder file(String file) { }

}

}