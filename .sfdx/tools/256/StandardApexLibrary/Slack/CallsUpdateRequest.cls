global class CallsUpdateRequest {
	global static Slack.CallsUpdateRequest.Builder builder() { }
	global Object clone() { }
	global String getDesktopAppJoinUrl() { }
	global String getId() { }
	global String getJoinUrl() { }
	global String getTitle() { }
	global String toString() { }
global class Builder {
	global CallsUpdateRequest.Builder() { }
	global Slack.CallsUpdateRequest build() { }
	global Object clone() { }
	global Slack.CallsUpdateRequest.Builder desktopAppJoinUrl(String desktopAppJoinUrl) { }
	global Slack.CallsUpdateRequest.Builder id(String id) { }
	global Slack.CallsUpdateRequest.Builder joinUrl(String joinUrl) { }
	global Slack.CallsUpdateRequest.Builder title(String title) { }

}

}