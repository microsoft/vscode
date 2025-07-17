global class OrchestrationWorkItem {
	global String assigneeId;
	global Datetime createdDate;
	global String description;
	global String flowType;
	global String id;
	global String label;
	global Datetime lastModifiedDate;
	global String relatedRecordId;
	global String screenFlowDeveloperName;
	global String screenFlowId;
	global String screenFlowInputs;
	global ConnectApi.OrchestrationWorkItemStatus status;
	global OrchestrationWorkItem() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}