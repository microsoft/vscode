global class NextBestAction {
	global Object clone() { }
	global static void deleteRecommendationReaction(String reactionId) { }
	global static ConnectApi.NBARecommendations executeStrategy(String strategyName, Integer maxResults, String contextRecordId, Boolean debugTrace) { }
	global static ConnectApi.NBARecommendations executeStrategy(String strategyName, Integer maxResults, String contextRecordId) { }
	global static ConnectApi.NBARecommendations executeStrategy(String strategyName, ConnectApi.NBAStrategyInput strategyInput) { }
	global static ConnectApi.Recommendation getRecommendation(String recommendationId) { }
	global static ConnectApi.RecommendationReaction getRecommendationReaction(String reactionId) { }
	global static ConnectApi.RecommendationReactions getRecommendationReactions(String onBehalfOfId, String createdById, String targetId, String contextRecordId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.RecommendationReaction setRecommendationReaction(ConnectApi.RecommendationReactionInput reaction) { }

}