global class TeamInfoRequest {
	global static Slack.TeamInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getDomain() { }
	global String getTeam() { }
	global String toString() { }
global class Builder {
	global TeamInfoRequest.Builder() { }
	global Slack.TeamInfoRequest build() { }
	global Object clone() { }
	global Slack.TeamInfoRequest.Builder domain(String domain) { }
	global Slack.TeamInfoRequest.Builder team(String team) { }

}

}