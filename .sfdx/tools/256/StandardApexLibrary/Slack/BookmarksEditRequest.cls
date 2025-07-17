global class BookmarksEditRequest {
	global static Slack.BookmarksEditRequest.Builder builder() { }
	global Object clone() { }
	global String getBookmarkId() { }
	global String getChannelId() { }
	global String getEmoji() { }
	global String getLink() { }
	global String getTitle() { }
	global String toString() { }
global class Builder {
	global BookmarksEditRequest.Builder() { }
	global Slack.BookmarksEditRequest.Builder bookmarkId(String bookmarkId) { }
	global Slack.BookmarksEditRequest build() { }
	global Slack.BookmarksEditRequest.Builder channelId(String channelId) { }
	global Object clone() { }
	global Slack.BookmarksEditRequest.Builder emoji(String emoji) { }
	global Slack.BookmarksEditRequest.Builder link(String link) { }
	global Slack.BookmarksEditRequest.Builder title(String title) { }

}

}