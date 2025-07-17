global class TeamProfileGetRequest {
	global static Slack.TeamProfileGetRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getVisibility() { }
	global String toString() { }
global class Builder {
	global TeamProfileGetRequest.Builder() { }
	global Slack.TeamProfileGetRequest build() { }
	global Object clone() { }
	global Slack.TeamProfileGetRequest.Builder teamId(String teamId) { }
	global Slack.TeamProfileGetRequest.Builder visibility(String visibility) { }

}

}