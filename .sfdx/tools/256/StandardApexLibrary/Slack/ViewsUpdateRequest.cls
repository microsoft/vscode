global class ViewsUpdateRequest {
	global static Slack.ViewsUpdateRequest.Builder builder() { }
	global Object clone() { }
	global String getExternalId() { }
	global String getHash() { }
	global String getViewId() { }
	global String toString() { }
global class Builder {
	global ViewsUpdateRequest.Builder() { }
	global Slack.ViewsUpdateRequest build() { }
	global Object clone() { }
	global Slack.ViewsUpdateRequest.Builder externalId(String externalId) { }
	global Slack.ViewsUpdateRequest.Builder hash(String hash) { }
	global Slack.ViewsUpdateRequest.Builder view(Slack.ModalView view) { }
	global Slack.ViewsUpdateRequest.Builder viewId(String viewId) { }

}

}