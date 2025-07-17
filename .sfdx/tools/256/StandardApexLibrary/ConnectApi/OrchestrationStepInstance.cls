global class OrchestrationStepInstance {
	global String assignedTo;
	global String assigneeType;
	global String comments;
	global String completedBy;
	global String completionTime;
	global String description;
	global String id;
	global String label;
	global String name;
	global ConnectApi.OrchestrationInstanceStatus status;
	global ConnectApi.OrchestrationStepType stepType;
	global List<ConnectApi.OrchestrationWorkItem> workItems;
	global OrchestrationStepInstance() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}