global class ViewContext {
	global Object clone() { }
	global String getHash() { }
	global String getId() { }
	global String getPreviousViewId() { }
	global String getType() { }
global class Builder {
	global ViewContext.Builder() { }
	global Slack.ViewContext build() { }
	global Object clone() { }
	global Slack.ViewContext.Builder hash(String hash) { }
	global Slack.ViewContext.Builder id(String id) { }
	global Slack.ViewContext.Builder previousViewId(String previousViewId) { }
	global Slack.ViewContext.Builder type(String type) { }

}

}