global class FilesInfoRequest {
	global static Slack.FilesInfoRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global String getFile() { }
	global Integer getPage() { }
	global String toString() { }
global class Builder {
	global FilesInfoRequest.Builder() { }
	global Slack.FilesInfoRequest build() { }
	global Object clone() { }
	global Slack.FilesInfoRequest.Builder count(Integer count) { }
	global Slack.FilesInfoRequest.Builder file(String file) { }
	global Slack.FilesInfoRequest.Builder page(Integer page) { }

}

}