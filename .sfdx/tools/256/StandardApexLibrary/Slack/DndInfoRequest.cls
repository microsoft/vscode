global class DndInfoRequest {
	global static Slack.DndInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global String getUser() { }
	global String toString() { }
global class Builder {
	global DndInfoRequest.Builder() { }
	global Slack.DndInfoRequest build() { }
	global Object clone() { }
	global Slack.DndInfoRequest.Builder teamId(String teamId) { }
	global Slack.DndInfoRequest.Builder user(String user) { }

}

}