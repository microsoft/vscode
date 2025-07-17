global class PinsAddRequest {
	global static Slack.PinsAddRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global PinsAddRequest.Builder() { }
	global Slack.PinsAddRequest build() { }
	global Slack.PinsAddRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.PinsAddRequest.Builder timestamp(String timestamp) { }

}

}