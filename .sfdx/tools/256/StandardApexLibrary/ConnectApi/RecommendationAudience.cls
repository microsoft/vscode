global class RecommendationAudience {
	global ConnectApi.AudienceCriteria criteria;
	global String id;
	global Integer memberCount;
	global ConnectApi.UserReferencePage members;
	global ConnectApi.User modifiedBy;
	global Datetime modifiedDate;
	global String name;
	global String url;
	global RecommendationAudience() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}