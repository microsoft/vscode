global class SearchMessagesRequest {
	global static Slack.SearchMessagesRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global String getCursor() { }
	global Integer getPage() { }
	global String getQuery() { }
	global String getSort() { }
	global String getSortDir() { }
	global String getTeamId() { }
	global Boolean isHighlight() { }
	global String toString() { }
global class Builder {
	global SearchMessagesRequest.Builder() { }
	global Slack.SearchMessagesRequest build() { }
	global Object clone() { }
	global Slack.SearchMessagesRequest.Builder count(Integer count) { }
	global Slack.SearchMessagesRequest.Builder cursor(String cursor) { }
	global Slack.SearchMessagesRequest.Builder highlight(Boolean highlight) { }
	global Slack.SearchMessagesRequest.Builder page(Integer page) { }
	global Slack.SearchMessagesRequest.Builder query(String query) { }
	global Slack.SearchMessagesRequest.Builder sortDir(String sortDir) { }
	global Slack.SearchMessagesRequest.Builder sortValue(String sortValue) { }
	global Slack.SearchMessagesRequest.Builder teamId(String teamId) { }

}

}