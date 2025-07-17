global class PromotionOutputRepresentation {
	global String description;
	global String lastUpdate;
	global Boolean lifecycleStatus;
	global String name;
	global List<ConnectApi.PromotionPatternOutputRepresentation> pattern;
	global String type;
	global ConnectApi.PromotionValidForOutputRepresentation validFor;
	global PromotionOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}