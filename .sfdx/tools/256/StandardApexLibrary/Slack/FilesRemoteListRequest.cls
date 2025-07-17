global class FilesRemoteListRequest {
	global static Slack.FilesRemoteListRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global String getTsFrom() { }
	global String getTsTo() { }
	global String toString() { }
global class Builder {
	global FilesRemoteListRequest.Builder() { }
	global Slack.FilesRemoteListRequest build() { }
	global Slack.FilesRemoteListRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.FilesRemoteListRequest.Builder cursor(String cursor) { }
	global Slack.FilesRemoteListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.FilesRemoteListRequest.Builder tsFrom(String tsFrom) { }
	global Slack.FilesRemoteListRequest.Builder tsTo(String tsTo) { }

}

}