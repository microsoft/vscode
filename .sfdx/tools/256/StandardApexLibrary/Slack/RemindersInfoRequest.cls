global class RemindersInfoRequest {
	global static Slack.RemindersInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getReminder() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global RemindersInfoRequest.Builder() { }
	global Slack.RemindersInfoRequest build() { }
	global Object clone() { }
	global Slack.RemindersInfoRequest.Builder reminder(String reminder) { }
	global Slack.RemindersInfoRequest.Builder teamId(String teamId) { }

}

}