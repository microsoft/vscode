global class FilesListRequest {
	global static Slack.FilesListRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global Integer getCount() { }
	global Integer getPage() { }
	global String getTeamId() { }
	global String getTsFrom() { }
	global String getTsTo() { }
	global List<String> getTypes() { }
	global String getUser() { }
	global Boolean isShowFilesHiddenByLimit() { }
	global String toString() { }
global class Builder {
	global FilesListRequest.Builder() { }
	global Slack.FilesListRequest build() { }
	global Slack.FilesListRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.FilesListRequest.Builder count(Integer count) { }
	global Slack.FilesListRequest.Builder page(Integer page) { }
	global Slack.FilesListRequest.Builder showFilesHiddenByLimit(Boolean showFilesHiddenByLimit) { }
	global Slack.FilesListRequest.Builder teamId(String teamId) { }
	global Slack.FilesListRequest.Builder tsFrom(String tsFrom) { }
	global Slack.FilesListRequest.Builder tsTo(String tsTo) { }
	global Slack.FilesListRequest.Builder types(List<String> types) { }
	global Slack.FilesListRequest.Builder user(String user) { }

}

}