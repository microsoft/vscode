global class ConversationsOpenRequest {
	global static Slack.ConversationsOpenRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global List<String> getUsers() { }
	global Boolean isReturnIm() { }
	global String toString() { }
global class Builder {
	global ConversationsOpenRequest.Builder() { }
	global Slack.ConversationsOpenRequest build() { }
	global Slack.ConversationsOpenRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsOpenRequest.Builder returnIm(Boolean returnIm) { }
	global Slack.ConversationsOpenRequest.Builder users(List<String> users) { }

}

}