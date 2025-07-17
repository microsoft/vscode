global class ModalView {
	global static Slack.ModalView.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global Slack.ViewReference getViewReference() { }
	global String toString() { }
global class Builder {
	global ModalView.Builder() { }
	global Slack.ModalView build() { }
	global Slack.ModalView.Builder clearOnClose(Boolean clearOnClose) { }
	global Object clone() { }
	global Slack.ModalView.Builder externalId(String externalId) { }
	global Slack.ModalView.Builder viewReference(Slack.ViewReference viewReference) { }

}

}