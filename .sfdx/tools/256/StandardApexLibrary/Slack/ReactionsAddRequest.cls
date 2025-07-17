global class ReactionsAddRequest {
	global static Slack.ReactionsAddRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getName() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global ReactionsAddRequest.Builder() { }
	global Slack.ReactionsAddRequest build() { }
	global Slack.ReactionsAddRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ReactionsAddRequest.Builder name(String name) { }
	global Slack.ReactionsAddRequest.Builder timestamp(String timestamp) { }

}

}