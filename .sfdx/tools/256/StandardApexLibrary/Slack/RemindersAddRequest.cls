global class RemindersAddRequest {
	global static Slack.RemindersAddRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getText() { }
	global String getTime() { }
	global String getUser() { }
	global String toString() { }
global class Builder {
	global RemindersAddRequest.Builder() { }
	global Slack.RemindersAddRequest build() { }
	global Object clone() { }
	global Slack.RemindersAddRequest.Builder teamId(String teamId) { }
	global Slack.RemindersAddRequest.Builder text(String text) { }
	global Slack.RemindersAddRequest.Builder timeValue(String timeValue) { }
	global Slack.RemindersAddRequest.Builder user(String user) { }

}

}