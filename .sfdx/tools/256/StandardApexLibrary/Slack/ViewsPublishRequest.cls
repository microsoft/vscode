global class ViewsPublishRequest {
	global static Slack.ViewsPublishRequest.Builder builder() { }
	global Object clone() { }
	global String getHash() { }
	global String getUserId() { }
	global String toString() { }
global class Builder {
	global ViewsPublishRequest.Builder() { }
	global Slack.ViewsPublishRequest build() { }
	global Object clone() { }
	global Slack.ViewsPublishRequest.Builder hash(String hash) { }
	global Slack.ViewsPublishRequest.Builder userId(String userId) { }
	global Slack.ViewsPublishRequest.Builder view(Slack.HomeView view) { }

}

}