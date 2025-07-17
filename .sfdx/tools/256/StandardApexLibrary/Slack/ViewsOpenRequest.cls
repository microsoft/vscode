global class ViewsOpenRequest {
	global static Slack.ViewsOpenRequest.Builder builder() { }
	global Object clone() { }
	global String getTriggerId() { }
	global String toString() { }
global class Builder {
	global ViewsOpenRequest.Builder() { }
	global Slack.ViewsOpenRequest build() { }
	global Object clone() { }
	global Slack.ViewsOpenRequest.Builder triggerId(String triggerId) { }
	global Slack.ViewsOpenRequest.Builder view(Slack.ModalView view) { }

}

}