global class OrchestrationStageInstance {
	global String completionTime;
	global String id;
	global String label;
	global String name;
	global ConnectApi.OrchestrationInstanceStatus status;
	global List<ConnectApi.OrchestrationStepInstance> stepInstances;
	global OrchestrationStageInstance() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}