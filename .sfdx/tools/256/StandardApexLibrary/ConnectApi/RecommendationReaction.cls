global class RecommendationReaction {
	global String aiModel;
	global ConnectApi.Reference contextRecord;
	global ConnectApi.Reference createdBy;
	global Datetime createdDate;
	global String externalId;
	global String id;
	global ConnectApi.Reference onBehalfOf;
	global ConnectApi.RecommendationReactionType reactionType;
	global ConnectApi.RecommendationMode recommendationMode;
	global Double recommendationScore;
	global ConnectApi.RecordSnapshot strategy;
	global ConnectApi.RecordSnapshot targetAction;
	global ConnectApi.Reference targetRecord;
	global String url;
	global RecommendationReaction() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}