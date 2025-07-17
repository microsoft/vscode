global class RemindersCompleteRequest {
	global static Slack.RemindersCompleteRequest.Builder builder() { }
	global Object clone() { }
	global String getReminder() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global RemindersCompleteRequest.Builder() { }
	global Slack.RemindersCompleteRequest build() { }
	global Object clone() { }
	global Slack.RemindersCompleteRequest.Builder reminder(String reminder) { }
	global Slack.RemindersCompleteRequest.Builder teamId(String teamId) { }

}

}