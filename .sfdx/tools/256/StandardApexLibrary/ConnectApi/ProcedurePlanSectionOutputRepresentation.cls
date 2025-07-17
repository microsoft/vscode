global class ProcedurePlanSectionOutputRepresentation {
	global ConnectApi.ProcedurePlanGenericErrorRepresentation error;
	global Boolean isInherited;
	global Boolean isSuccess;
	global String phase;
	global List<ConnectApi.ProcedurePlanOptionOutputRepresentation> procedurePlanOptions;
	global String recordId;
	global String resolutionType;
	global String sectionType;
	global Integer sequence;
	global String subSectionType;
	global ProcedurePlanSectionOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}