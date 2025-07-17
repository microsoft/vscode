global class SearchFilesRequest {
	global static Slack.SearchFilesRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global Integer getPage() { }
	global String getQuery() { }
	global String getSort() { }
	global String getSortDir() { }
	global String getTeamId() { }
	global Boolean isHighlight() { }
	global String toString() { }
global class Builder {
	global SearchFilesRequest.Builder() { }
	global Slack.SearchFilesRequest build() { }
	global Object clone() { }
	global Slack.SearchFilesRequest.Builder count(Integer count) { }
	global Slack.SearchFilesRequest.Builder highlight(Boolean highlight) { }
	global Slack.SearchFilesRequest.Builder page(Integer page) { }
	global Slack.SearchFilesRequest.Builder query(String query) { }
	global Slack.SearchFilesRequest.Builder sortDir(String sortDir) { }
	global Slack.SearchFilesRequest.Builder sortValue(String sortValue) { }
	global Slack.SearchFilesRequest.Builder teamId(String teamId) { }

}

}