global class RecommendationAudienceInput {
	global ConnectApi.AudienceCriteriaInput criteria;
	global ConnectApi.RecommendationAudienceMemberOperationType memberOperationType;
	global List<String> members;
	global String name;
	global RecommendationAudienceInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}