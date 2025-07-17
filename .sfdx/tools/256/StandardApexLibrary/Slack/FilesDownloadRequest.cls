global class FilesDownloadRequest {
	global static Slack.FilesDownloadRequest.Builder builder() { }
	global Object clone() { }
	global Slack.File getFile() { }
	global String toString() { }
global class Builder {
	global FilesDownloadRequest.Builder() { }
	global Slack.FilesDownloadRequest build() { }
	global Object clone() { }
	global Slack.FilesDownloadRequest.Builder file(Slack.File file) { }

}

}