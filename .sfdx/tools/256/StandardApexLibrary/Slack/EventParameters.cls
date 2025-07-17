global class EventParameters {
	global EventParameters(Slack.Event event, String eventId, Integer eventTime) { }
	global Object clone() { }
	global Slack.Event getEvent() { }
	global String getEventId() { }
	global Integer getEventTime() { }

}