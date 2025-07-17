global class CallsParticipantsRemoveRequest {
	global static Slack.CallsParticipantsRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getId() { }
	global List<Slack.CallParticipant> getUsers() { }
	global String toString() { }
global class Builder {
	global CallsParticipantsRemoveRequest.Builder() { }
	global Slack.CallsParticipantsRemoveRequest build() { }
	global Object clone() { }
	global Slack.CallsParticipantsRemoveRequest.Builder id(String id) { }
	global Slack.CallsParticipantsRemoveRequest.Builder users(List<Slack.CallParticipant> users) { }

}

}