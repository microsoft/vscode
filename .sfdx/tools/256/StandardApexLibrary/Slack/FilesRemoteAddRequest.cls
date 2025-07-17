global class FilesRemoteAddRequest {
	global static Slack.FilesRemoteAddRequest.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global String getExternalUrl() { }
	global String getFiletype() { }
	global String getTitle() { }
	global String toString() { }
global class Builder {
	global FilesRemoteAddRequest.Builder() { }
	global Slack.FilesRemoteAddRequest build() { }
	global Object clone() { }
	global Slack.FilesRemoteAddRequest.Builder externalId(String externalId) { }
	global Slack.FilesRemoteAddRequest.Builder externalUrl(String externalUrl) { }
	global Slack.FilesRemoteAddRequest.Builder filetype(String filetype) { }
	global Slack.FilesRemoteAddRequest.Builder title(String title) { }

}

}