global class ConversationsInviteSharedRequest {
	global static Slack.ConversationsInviteSharedRequest.Builder builder() { }
	global Object clone() { }
	global String getChannel() { }
	global List<String> getEmails() { }
	global Boolean getExternalLimited() { }
	global List<String> getUserIds() { }
	global String toString() { }
global class Builder {
	global ConversationsInviteSharedRequest.Builder() { }
	global Slack.ConversationsInviteSharedRequest build() { }
	global Slack.ConversationsInviteSharedRequest.Builder channel(String channel) { }
	global Object clone() { }
	global Slack.ConversationsInviteSharedRequest.Builder emails(List<String> emails) { }
	global Slack.ConversationsInviteSharedRequest.Builder externalLimited(Boolean externalLimited) { }
	global Slack.ConversationsInviteSharedRequest.Builder userIds(List<String> userIds) { }

}

}