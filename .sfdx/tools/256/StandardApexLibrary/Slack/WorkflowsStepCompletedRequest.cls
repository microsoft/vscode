global class WorkflowsStepCompletedRequest {
	global static Slack.WorkflowsStepCompletedRequest.Builder builder() { }
	global Object clone() { }
	global Map<String,Object> getOutputs() { }
	global String getOutputsAsString() { }
	global String getWorkflowStepExecuteId() { }
	global String toString() { }
global class Builder {
	global WorkflowsStepCompletedRequest.Builder() { }
	global Slack.WorkflowsStepCompletedRequest build() { }
	global Object clone() { }
	global Slack.WorkflowsStepCompletedRequest.Builder outputs(Map<String,Object> outputs) { }
	global Slack.WorkflowsStepCompletedRequest.Builder outputsAsString(String outputsAsString) { }
	global Slack.WorkflowsStepCompletedRequest.Builder workflowStepExecuteId(String workflowStepExecuteId) { }

}

}