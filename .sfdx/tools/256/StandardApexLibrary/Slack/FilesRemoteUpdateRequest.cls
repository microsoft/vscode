global class FilesRemoteUpdateRequest {
	global static Slack.FilesRemoteUpdateRequest.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global String getExternalUrl() { }
	global String getFiletype() { }
	global String getTitle() { }
	global String toString() { }
global class Builder {
	global FilesRemoteUpdateRequest.Builder() { }
	global Slack.FilesRemoteUpdateRequest build() { }
	global Object clone() { }
	global Slack.FilesRemoteUpdateRequest.Builder externalId(String externalId) { }
	global Slack.FilesRemoteUpdateRequest.Builder externalUrl(String externalUrl) { }
	global Slack.FilesRemoteUpdateRequest.Builder filetype(String filetype) { }
	global Slack.FilesRemoteUpdateRequest.Builder title(String title) { }

}

}