global class BookmarksAddRequest {
	global static Slack.BookmarksAddRequest.Builder builder() { }
	global Object clone() { }
	global String getChannelId() { }
	global String getEmoji() { }
	global String getEntityId() { }
	global String getLink() { }
	global String getParentId() { }
	global String getTitle() { }
	global String getType() { }
	global String toString() { }
global class Builder {
	global BookmarksAddRequest.Builder() { }
	global Slack.BookmarksAddRequest build() { }
	global Slack.BookmarksAddRequest.Builder channelId(String channelId) { }
	global Object clone() { }
	global Slack.BookmarksAddRequest.Builder emoji(String emoji) { }
	global Slack.BookmarksAddRequest.Builder entityId(String entityId) { }
	global Slack.BookmarksAddRequest.Builder link(String link) { }
	global Slack.BookmarksAddRequest.Builder parentId(String parentId) { }
	global Slack.BookmarksAddRequest.Builder title(String title) { }
	global Slack.BookmarksAddRequest.Builder type(String type) { }

}

}