global class ReactionsListRequest {
	global static Slack.ReactionsListRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global Integer getPage() { }
	global String getTeamId() { }
	global String getUser() { }
	global Boolean isFull() { }
	global String toString() { }
global class Builder {
	global ReactionsListRequest.Builder() { }
	global Slack.ReactionsListRequest build() { }
	global Object clone() { }
	global Slack.ReactionsListRequest.Builder count(Integer count) { }
	global Slack.ReactionsListRequest.Builder cursor(String cursor) { }
	global Slack.ReactionsListRequest.Builder full(Boolean full) { }
	global Slack.ReactionsListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.ReactionsListRequest.Builder page(Integer page) { }
	global Slack.ReactionsListRequest.Builder teamId(String teamId) { }
	global Slack.ReactionsListRequest.Builder user(String user) { }

}

}