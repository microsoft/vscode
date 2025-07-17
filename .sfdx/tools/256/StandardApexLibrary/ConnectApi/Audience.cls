global class Audience {
	global List<ConnectApi.AudienceCriteriaDetail> criteria;
	global String customFormula;
	global ConnectApi.FormulaFilterType formulaFilterType;
	global String id;
	global String name;
	global List<ConnectApi.AudienceTargetAssignment> targets;
	global String url;
	global Audience() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}