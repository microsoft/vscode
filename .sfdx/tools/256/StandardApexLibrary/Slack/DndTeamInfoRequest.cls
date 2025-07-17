global class DndTeamInfoRequest {
	global static Slack.DndTeamInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global List<String> getUsers() { }
	global String toString() { }
global class Builder {
	global DndTeamInfoRequest.Builder() { }
	global Slack.DndTeamInfoRequest build() { }
	global Object clone() { }
	global Slack.DndTeamInfoRequest.Builder teamId(String teamId) { }
	global Slack.DndTeamInfoRequest.Builder users(List<String> users) { }

}

}