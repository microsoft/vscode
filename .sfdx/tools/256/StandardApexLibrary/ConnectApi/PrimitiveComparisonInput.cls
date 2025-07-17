global class PrimitiveComparisonInput {
	global List<ConnectApi.LabeledSubjectsConfigInput> joinPath;
	global List<ConnectApi.LabeledSubjectsConfigInput> path;
	global Boolean selfReference;
	global ConnectApi.SubjectInput subject;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }

}