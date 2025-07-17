global class SearchAllRequest {
	global static Slack.SearchAllRequest.Builder builder() { }
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
	global SearchAllRequest.Builder() { }
	global Slack.SearchAllRequest build() { }
	global Object clone() { }
	global Slack.SearchAllRequest.Builder count(Integer count) { }
	global Slack.SearchAllRequest.Builder highlight(Boolean highlight) { }
	global Slack.SearchAllRequest.Builder page(Integer page) { }
	global Slack.SearchAllRequest.Builder query(String query) { }
	global Slack.SearchAllRequest.Builder sortDir(String sortDir) { }
	global Slack.SearchAllRequest.Builder sortValue(String sortValue) { }
	global Slack.SearchAllRequest.Builder teamId(String teamId) { }

}

}