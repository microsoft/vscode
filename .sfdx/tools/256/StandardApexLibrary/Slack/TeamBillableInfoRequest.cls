global class TeamBillableInfoRequest {
	global static Slack.TeamBillableInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUser() { }
	global String toString() { }
global class Builder {
	global TeamBillableInfoRequest.Builder() { }
	global Slack.TeamBillableInfoRequest build() { }
	global Object clone() { }
	global Slack.TeamBillableInfoRequest.Builder teamId(String teamId) { }
	global Slack.TeamBillableInfoRequest.Builder user(String user) { }

}

}