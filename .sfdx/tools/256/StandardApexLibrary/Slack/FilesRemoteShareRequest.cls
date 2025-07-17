global class FilesRemoteShareRequest {
	global static Slack.FilesRemoteShareRequest.Builder builder() { }
	global Object clone() { }
	global List<String> getChannels() { }
	global String getExternalId() { }
	global String getFile() { }
	global String toString() { }
global class Builder {
	global FilesRemoteShareRequest.Builder() { }
	global Slack.FilesRemoteShareRequest build() { }
	global Slack.FilesRemoteShareRequest.Builder channels(List<String> channels) { }
	global Object clone() { }
	global Slack.FilesRemoteShareRequest.Builder externalId(String externalId) { }
	global Slack.FilesRemoteShareRequest.Builder file(String file) { }

}

}