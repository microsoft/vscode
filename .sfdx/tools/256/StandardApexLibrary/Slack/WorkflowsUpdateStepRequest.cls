global class WorkflowsUpdateStepRequest {
	global static Slack.WorkflowsUpdateStepRequest.Builder builder() { }
	global Object clone() { }
	global Map<String,Slack.WorkflowStepInput> getInputs() { }
	global String getInputsAsString() { }
	global List<Slack.WorkflowStepOutput> getOutputs() { }
	global String getOutputsAsString() { }
	global String getStepImageUrl() { }
	global String getStepName() { }
	global String getWorkflowStepEditId() { }
	global String toString() { }
global class Builder {
	global WorkflowsUpdateStepRequest.Builder() { }
	global Slack.WorkflowsUpdateStepRequest build() { }
	global Object clone() { }
	global Slack.WorkflowsUpdateStepRequest.Builder inputs(Map<String,Slack.WorkflowStepInput> inputs) { }
	global Slack.WorkflowsUpdateStepRequest.Builder inputsAsString(String inputsAsString) { }
	global Slack.WorkflowsUpdateStepRequest.Builder outputs(List<Slack.WorkflowStepOutput> outputs) { }
	global Slack.WorkflowsUpdateStepRequest.Builder outputsAsString(String outputsAsString) { }
	global Slack.WorkflowsUpdateStepRequest.Builder stepImageUrl(String stepImageUrl) { }
	global Slack.WorkflowsUpdateStepRequest.Builder stepName(String stepName) { }
	global Slack.WorkflowsUpdateStepRequest.Builder workflowStepEditId(String workflowStepEditId) { }

}

}