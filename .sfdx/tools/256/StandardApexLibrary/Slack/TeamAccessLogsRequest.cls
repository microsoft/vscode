global class TeamAccessLogsRequest {
	global static Slack.TeamAccessLogsRequest.Builder builder() { }
	global Object clone() { }
	global Integer getBefore() { }
	global Integer getCount() { }
	global Integer getPage() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global TeamAccessLogsRequest.Builder() { }
	global Slack.TeamAccessLogsRequest.Builder before(Integer before) { }
	global Slack.TeamAccessLogsRequest build() { }
	global Object clone() { }
	global Slack.TeamAccessLogsRequest.Builder count(Integer count) { }
	global Slack.TeamAccessLogsRequest.Builder page(Integer page) { }
	global Slack.TeamAccessLogsRequest.Builder teamId(String teamId) { }

}

}