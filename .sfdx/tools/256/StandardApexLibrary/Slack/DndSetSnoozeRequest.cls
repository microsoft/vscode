global class DndSetSnoozeRequest {
	global static Slack.DndSetSnoozeRequest.Builder builder() { }
	global Object clone() { }
	global Integer getNumMinutes() { }
	global String toString() { }
global class Builder {
	global DndSetSnoozeRequest.Builder() { }
	global Slack.DndSetSnoozeRequest build() { }
	global Object clone() { }
	global Slack.DndSetSnoozeRequest.Builder numMinutes(Integer numMinutes) { }

}

}