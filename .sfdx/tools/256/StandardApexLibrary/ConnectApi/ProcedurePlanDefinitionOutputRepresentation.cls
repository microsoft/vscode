global class ProcedurePlanDefinitionOutputRepresentation {
	global String description;
	global String developerName;
	global ConnectApi.ProcedurePlanGenericErrorRepresentation error;
	global String name;
	global String primaryObject;
	global List<ConnectApi.ProcedurePlanDefinitionVersionOutputRepresentation> procedurePlanDefinitionVersions;
	global String processType;
	global String recordId;
	global Boolean success;
	global ProcedurePlanDefinitionOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}