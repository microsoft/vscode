global class GetLearningOutputRepresentation {
	global List<ConnectApi.LearningFoundationItemOutput> corequisites;
	global List<ConnectApi.EducationApiErrorDetails> errors;
	global ConnectApi.LearningOutput learning;
	global List<ConnectApi.LearningOutcomeItemOutput> outcomes;
	global List<ConnectApi.LearningFoundationItemOutput> prerequisites;
	global List<ConnectApi.LearningFoundationItemOutput> recommended;
	global Boolean success;
	global GetLearningOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}