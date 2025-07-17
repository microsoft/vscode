global class NBARecommendation {
	global String acceptanceLabel;
	global String aiModel;
	global String description;
	global String externalId;
	global String imageUrl;
	global String recommendationMode;
	global Double recommendationScore;
	global String rejectionLabel;
	global ConnectApi.AbstractNBATarget target;
	global ConnectApi.AbstractNBAAction targetAction;
	global NBARecommendation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}