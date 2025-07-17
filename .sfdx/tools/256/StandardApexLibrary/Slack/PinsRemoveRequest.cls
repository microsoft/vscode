global class PinsRemoveRequest {
	global static Slack.PinsRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global String getTimestamp() { }
	global String toString() { }
global class Builder {
	global PinsRemoveRequest.Builder() { }
	global Slack.PinsRemoveRequest build() { }
	global Slack.PinsRemoveRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.PinsRemoveRequest.Builder timestamp(String timestamp) { }

}

}