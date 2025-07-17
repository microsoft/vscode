global class EmojiListResponse {
	global EmojiListResponse() { }
	global Object clone() { }
	global String getCacheTs() { }
	global List<Slack.EmojiListResponse.Category> getCategories() { }
	global String getCategoriesVersion() { }
	global Map<String,String> getEmoji() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setCacheTs(String cacheTs) { }
	global void setCategories(List<Slack.EmojiListResponse.Category> categories) { }
	global void setCategoriesVersion(String categoriesVersion) { }
	global void setEmoji(Map<String,String> emoji) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Category {
	global EmojiListResponse.Category() { }
	global Object clone() { }
	global List<String> getEmojiNames() { }
	global String getName() { }
	global void setEmojiNames(List<String> emojiNames) { }
	global void setName(String name) { }

}

}