global class RemindersDeleteRequest {
	global static Slack.RemindersDeleteRequest.Builder builder() { }
	global Object clone() { }
	global String getReminder() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global RemindersDeleteRequest.Builder() { }
	global Slack.RemindersDeleteRequest build() { }
	global Object clone() { }
	global Slack.RemindersDeleteRequest.Builder reminder(String reminder) { }
	global Slack.RemindersDeleteRequest.Builder teamId(String teamId) { }

}

}