global class ProcedurePlanDefinitionVersionOutputRepresentation {
	global Boolean active;
	global String contextDefinition;
	global String developerName;
	global Datetime effectiveFrom;
	global Datetime effectiveTo;
	global ConnectApi.ProcedurePlanGenericErrorRepresentation error;
	global String inheritedFrom;
	global List<ConnectApi.ProcedurePlanSectionOutputRepresentation> procedurePlanSections;
	global Integer rank;
	global String readContextMapping;
	global String recordId;
	global String saveContextMapping;
	global Boolean success;
	global ProcedurePlanDefinitionVersionOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}