global class CommunityModeration {
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagType type, ConnectApi.CommunityFlagVisibility visibility, String note) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagType type, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagType type, String note) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagVisibility visibility, String note) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagType type) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId, String note) { }
	global static ConnectApi.ModerationFlags addFlagToComment(String communityId, String commentId) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagType type, ConnectApi.CommunityFlagVisibility visibility, String note) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagType type, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagType type, String note) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagVisibility visibility, String note) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagType type) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId, String note) { }
	global static ConnectApi.ModerationCapability addFlagToFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.ModerationFlags addFlagToFeedItem(String communityId, String feedItemId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationFlags addFlagToFeedItem(String communityId, String feedItemId) { }
	global Object clone() { }
	global static ConnectApi.ModerationFlags getFlagsOnComment(String communityId, String commentId, ConnectApi.CommunityFlagVisibility visibility, Integer pageSize, String pageParam) { }
	global static ConnectApi.ModerationFlags getFlagsOnComment(String communityId, String commentId, Integer pageSize, String pageParam) { }
	global static ConnectApi.ModerationFlags getFlagsOnComment(String communityId, String commentId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationFlags getFlagsOnComment(String communityId, String commentId) { }
	global static ConnectApi.ModerationCapability getFlagsOnFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagVisibility visibility, Integer pageSize, String pageParam) { }
	global static ConnectApi.ModerationCapability getFlagsOnFeedElement(String communityId, String feedElementId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ModerationCapability getFlagsOnFeedElement(String communityId, String feedElementId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationCapability getFlagsOnFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.ModerationFlags getFlagsOnFeedItem(String communityId, String feedItemId, ConnectApi.CommunityFlagVisibility visibility) { }
	global static ConnectApi.ModerationFlags getFlagsOnFeedItem(String communityId, String feedItemId) { }
	global static void removeFlagFromComment(String communityId, String commentId, String userId) { }
	global static void removeFlagFromFeedElement(String communityId, String feedElementId, String userId) { }
	global static void removeFlagFromFeedItem(String communityId, String feedItemId, String userId) { }

}