global class ApprovalAttachment {
	global String id;
	global List<ConnectApi.ApprovalPostTemplateField> postTemplateFields;
	global String processInstanceStepId;
	global ConnectApi.WorkflowProcessStatus status;
	global ApprovalAttachment() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}