global class Topics {
	global static ConnectApi.Topic assignTopic(String communityId, String recordId, String topicId) { }
	global static ConnectApi.Topic assignTopicByName(String communityId, String recordId, String topicName) { }
	global Object clone() { }
	global static ConnectApi.Topic createTopic(String communityId, String name, String description) { }
	global static ConnectApi.TopicPage createTopicDataCategoryRules(String communityId, String dataCategoryGroup, String dataCategory, ConnectApi.TopicNamesInput topicNames) { }
	global static void deleteTopic(String communityId, String topicId) { }
	global static ConnectApi.ChatterGroupSummaryPage getGroupsRecentlyTalkingAboutTopic(String communityId, String topicId) { }
	global static ConnectApi.TopicPage getRecentlyTalkingAboutTopicsForGroup(String communityId, String groupId) { }
	global static ConnectApi.TopicPage getRecentlyTalkingAboutTopicsForUser(String communityId, String userId) { }
	global static ConnectApi.TopicPage getRelatedTopics(String communityId, String topicId) { }
	global static ConnectApi.Topic getTopic(String communityId, String topicId) { }
	global static ConnectApi.TopicPage getTopicDataCategoryRules(String communityId, String dataCategoryGroup, String dataCategory) { }
	global static ConnectApi.TopicSuggestionPage getTopicSuggestions(String communityId, String recordId, Integer maxResults) { }
	global static ConnectApi.TopicSuggestionPage getTopicSuggestions(String communityId, String recordId) { }
	global static ConnectApi.TopicSuggestionPage getTopicSuggestionsForText(String communityId, String text, Integer maxResults) { }
	global static ConnectApi.TopicSuggestionPage getTopicSuggestionsForText(String communityId, String text) { }
	global static ConnectApi.TopicPage getTopics(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.TopicSort sortParam) { }
	global static ConnectApi.TopicPage getTopics(String communityId, Integer pageParam, Integer pageSize, ConnectApi.TopicSort sortParam) { }
	global static ConnectApi.TopicPage getTopics(String communityId, String q, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.TopicPage getTopics(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.TopicPage getTopics(String communityId, String q, Boolean exactMatch) { }
	global static ConnectApi.TopicPage getTopics(String communityId, String q, ConnectApi.TopicSort sortParam) { }
	global static ConnectApi.TopicPage getTopics(String communityId, ConnectApi.TopicSort sortParam) { }
	global static ConnectApi.TopicPage getTopics(String communityId, String recordId) { }
	global static ConnectApi.TopicPage getTopics(String communityId) { }
	global static ConnectApi.TopicPage getTopicsOrFallBackToRenamedTopics(String communityId, String q, Boolean exactMatch, Boolean fallBackToRenamedTopics) { }
	global static ConnectApi.TopicPage getTrendingTopics(String communityId, Integer maxResults) { }
	global static ConnectApi.TopicPage getTrendingTopics(String communityId) { }
	global static ConnectApi.Topic mergeTopics(String communityId, String topicId, List<String> idsToMerge) { }
	global static ConnectApi.TopicPage reassignTopicDataCategoryRules(String communityId, String dataCategoryGroup, String dataCategory, ConnectApi.TopicNamesInput topicNames) { }
	global static ConnectApi.TopicPage reassignTopicsByName(String communityId, String recordId, ConnectApi.TopicNamesInput topicNames) { }
	global static void setTestGetGroupsRecentlyTalkingAboutTopic(String communityId, String topicId, ConnectApi.ChatterGroupSummaryPage result) { }
	global static void setTestGetRecentlyTalkingAboutTopicsForGroup(String communityId, String groupId, ConnectApi.TopicPage result) { }
	global static void setTestGetRecentlyTalkingAboutTopicsForUser(String communityId, String userId, ConnectApi.TopicPage result) { }
	global static void setTestGetRelatedTopics(String communityId, String topicId, ConnectApi.TopicPage result) { }
	global static void setTestGetTopicSuggestions(String communityId, String recordId, Integer maxResults, ConnectApi.TopicSuggestionPage result) { }
	global static void setTestGetTopicSuggestions(String communityId, String recordId, ConnectApi.TopicSuggestionPage result) { }
	global static void setTestGetTopicSuggestionsForText(String communityId, String text, Integer maxResults, ConnectApi.TopicSuggestionPage result) { }
	global static void setTestGetTopicSuggestionsForText(String communityId, String text, ConnectApi.TopicSuggestionPage result) { }
	global static void setTestGetTrendingTopics(String communityId, Integer maxResults, ConnectApi.TopicPage result) { }
	global static void setTestGetTrendingTopics(String communityId, ConnectApi.TopicPage result) { }
	global static void unassignTopic(String communityId, String recordId, String topicId) { }
	global static ConnectApi.Topic updateTopic(String communityId, String topicId, ConnectApi.TopicInput topic) { }
	global static ConnectApi.TopicPage updateTopicsForArticlesInDataCategory(String communityId, String dataCategoryGroup, String dataCategory, ConnectApi.ArticleTopicAssignmentJobInput articleTopicAssignmentJob) { }

}