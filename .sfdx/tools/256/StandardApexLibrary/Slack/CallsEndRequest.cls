global class CallsEndRequest {
	global static Slack.CallsEndRequest.Builder builder() { }
	global Object clone() { }
	global Integer getDuration() { }
	global String getId() { }
	global String toString() { }
global class Builder {
	global CallsEndRequest.Builder() { }
	global Slack.CallsEndRequest build() { }
	global Object clone() { }
	global Slack.CallsEndRequest.Builder duration(Integer duration) { }
	global Slack.CallsEndRequest.Builder id(String id) { }

}

}