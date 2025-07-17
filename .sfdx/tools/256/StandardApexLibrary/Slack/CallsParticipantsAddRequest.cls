global class CallsParticipantsAddRequest {
	global static Slack.CallsParticipantsAddRequest.Builder builder() { }
	global Object clone() { }
	global String getId() { }
	global List<Slack.CallParticipant> getUsers() { }
	global String toString() { }
global class Builder {
	global CallsParticipantsAddRequest.Builder() { }
	global Slack.CallsParticipantsAddRequest build() { }
	global Object clone() { }
	global Slack.CallsParticipantsAddRequest.Builder id(String id) { }
	global Slack.CallsParticipantsAddRequest.Builder users(List<Slack.CallParticipant> users) { }

}

}