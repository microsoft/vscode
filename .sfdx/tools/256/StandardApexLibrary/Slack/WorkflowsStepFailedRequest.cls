global class WorkflowsStepFailedRequest {
	global static Slack.WorkflowsStepFailedRequest.Builder builder() { }
	global Object clone() { }
	global Map<String,Object> getError() { }
	global String getWorkflowStepExecuteId() { }
	global String toString() { }
global class Builder {
	global WorkflowsStepFailedRequest.Builder() { }
	global Slack.WorkflowsStepFailedRequest build() { }
	global Object clone() { }
	global Slack.WorkflowsStepFailedRequest.Builder error(Map<String,Object> error) { }
	global Slack.WorkflowsStepFailedRequest.Builder workflowStepExecuteId(String workflowStepExecuteId) { }

}

}