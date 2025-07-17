global class ViewsPushRequest {
	global static Slack.ViewsPushRequest.Builder builder() { }
	global Object clone() { }
	global String getTriggerId() { }
	global String toString() { }
global class Builder {
	global ViewsPushRequest.Builder() { }
	global Slack.ViewsPushRequest build() { }
	global Object clone() { }
	global Slack.ViewsPushRequest.Builder triggerId(String triggerId) { }
	global Slack.ViewsPushRequest.Builder view(Slack.ModalView view) { }

}

}