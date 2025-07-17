global class BookmarksRemoveRequest {
	global static Slack.BookmarksRemoveRequest.Builder builder() { }
	global Object clone() { }
	global String getBookmarkId() { }
	global String getChannelId() { }
	global String toString() { }
global class Builder {
	global BookmarksRemoveRequest.Builder() { }
	global Slack.BookmarksRemoveRequest.Builder bookmarkId(String bookmarkId) { }
	global Slack.BookmarksRemoveRequest build() { }
	global Slack.BookmarksRemoveRequest.Builder channelId(String channelId) { }
	global Object clone() { }

}

}