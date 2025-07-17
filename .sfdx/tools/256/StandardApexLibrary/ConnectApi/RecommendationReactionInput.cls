global class RecommendationReactionInput {
	global String aiModel;
	global String contextRecordId;
	global String executionId;
	global String externalId;
	global String onBehalfOfId;
	global ConnectApi.RecommendationReactionType reactionType;
	global ConnectApi.RecommendationMode recommendationMode;
	global Double recommendationScore;
	global String strategyName;
	global String targetActionId;
	global String targetActionName;
	global String targetId;
	global RecommendationReactionInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}