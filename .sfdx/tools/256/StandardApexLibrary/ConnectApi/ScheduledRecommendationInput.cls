global class ScheduledRecommendationInput {
	global ConnectApi.RecommendationChannel channel;
	global Boolean enabled;
	global Integer rank;
	global String recommendationAudienceId;
	global String recommendationDefinitionId;
	global ScheduledRecommendationInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}