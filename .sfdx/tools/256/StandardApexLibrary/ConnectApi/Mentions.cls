global class Mentions {
	global Object clone() { }
	global static ConnectApi.MentionCompletionPage getMentionCompletions(String communityId, String q, String contextId, ConnectApi.MentionCompletionType type, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.MentionCompletionPage getMentionCompletions(String communityId, String q, String contextId) { }
	global static ConnectApi.MentionValidations getMentionValidations(String communityId, String parentId, List<String> recordIds, ConnectApi.FeedItemVisibilityType visibility) { }
	global static void setTestGetMentionCompletions(String communityId, String q, String contextId, ConnectApi.MentionCompletionType type, Integer pageParam, Integer pageSize, ConnectApi.MentionCompletionPage result) { }
	global static void setTestGetMentionCompletions(String communityId, String q, String contextId, ConnectApi.MentionCompletionPage result) { }

}