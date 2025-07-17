global class CallsAddRequest {
	global static Slack.CallsAddRequest.Builder builder() { }
	global Object clone() { }
	global String getCreatedBy() { }
	global Integer getDateStart() { }
	global String getDesktopAppJoinUrl() { }
	global String getExternalDisplayId() { }
	global String getExternalUniqueId() { }
	global String getJoinUrl() { }
	global String getTitle() { }
	global List<Slack.CallParticipant> getUsers() { }
	global String toString() { }
global class Builder {
	global CallsAddRequest.Builder() { }
	global Slack.CallsAddRequest build() { }
	global Object clone() { }
	global Slack.CallsAddRequest.Builder createdBy(String createdBy) { }
	global Slack.CallsAddRequest.Builder dateStart(Integer dateStart) { }
	global Slack.CallsAddRequest.Builder desktopAppJoinUrl(String desktopAppJoinUrl) { }
	global Slack.CallsAddRequest.Builder externalDisplayId(String externalDisplayId) { }
	global Slack.CallsAddRequest.Builder externalUniqueId(String externalUniqueId) { }
	global Slack.CallsAddRequest.Builder joinUrl(String joinUrl) { }
	global Slack.CallsAddRequest.Builder title(String title) { }
	global Slack.CallsAddRequest.Builder users(List<Slack.CallParticipant> users) { }

}

}