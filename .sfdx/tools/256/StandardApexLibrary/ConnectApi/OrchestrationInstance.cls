global class OrchestrationInstance {
	global String flowDefinitionDeveloperName;
	global String flowDefinitionId;
	global String flowDefinitionName;
	global String id;
	global String interviewId;
	global List<ConnectApi.OrchestrationStageInstance> stageInstances;
	global ConnectApi.OrchestrationInstanceStatus status;
	global OrchestrationInstance() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}