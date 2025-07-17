global class AppRequestedEvent {
	global AppRequestedEvent() { }
	global Object clone() { }
	global Slack.AppRequest getAppRequest() { }
	global String getSubtype() { }
	global String getType() { }
	global void setAppRequest(Slack.AppRequest appRequest) { }
	global String toString() { }

}