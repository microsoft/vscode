global class RemindersListRequest {
	global static Slack.RemindersListRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global RemindersListRequest.Builder() { }
	global Slack.RemindersListRequest build() { }
	global Object clone() { }
	global Slack.RemindersListRequest.Builder teamId(String teamId) { }

}

}