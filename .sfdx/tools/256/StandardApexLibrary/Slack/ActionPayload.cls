global class ActionPayload {
	global Object clone() { }
	global String getName() { }
	global String getType() { }
	global Object getValue() { }
global class Builder {
	global ActionPayload.Builder() { }
	global Slack.ActionPayload build() { }
	global Object clone() { }
	global Slack.ActionPayload.Builder name(String name) { }
	global Slack.ActionPayload.Builder type(String type) { }
	global Slack.ActionPayload.Builder value(Object value) { }

}

}