global class ChatterFavorites {
	global static ConnectApi.FeedFavorite addFavorite(String communityId, String subjectId, String searchText) { }
	global static ConnectApi.FeedFavorite addRecordFavorite(String communityId, String subjectId, String targetId) { }
	global Object clone() { }
	global static void deleteFavorite(String communityId, String subjectId, String favoriteId) { }
	global static ConnectApi.FeedFavorite getFavorite(String communityId, String subjectId, String favoriteId) { }
	global static ConnectApi.FeedFavorites getFavorites(String communityId, String subjectId) { }
	global static ConnectApi.FeedElementPage getFeedElements(String communityId, String subjectId, String favoriteId, Integer recentCommentCount, Integer elementsPerBundle, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElements(String communityId, String subjectId, String favoriteId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElements(String communityId, String subjectId, String favoriteId) { }
	global static ConnectApi.FeedItemPage getFeedItems(String communityId, String subjectId, String favoriteId, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItems(String communityId, String subjectId, String favoriteId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItems(String communityId, String subjectId, String favoriteId) { }
	global static void setTestGetFeedElements(String communityId, String subjectId, String favoriteId, Integer recentCommentCount, Integer elementsPerBundle, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElements(String communityId, String subjectId, String favoriteId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElements(String communityId, String subjectId, String favoriteId, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedItems(String communityId, String subjectId, String favoriteId, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItems(String communityId, String subjectId, String favoriteId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItems(String communityId, String subjectId, String favoriteId, ConnectApi.FeedItemPage result) { }
	global static ConnectApi.FeedFavorite updateFavorite(String communityId, String subjectId, String favoriteId, Boolean updateLastViewDate) { }

}