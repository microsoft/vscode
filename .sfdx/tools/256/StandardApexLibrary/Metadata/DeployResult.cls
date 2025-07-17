global class DeployResult {
	global String canceledBy;
	global String canceledByName;
	global Boolean checkOnly;
	global Datetime completedDate;
	global String createdBy;
	global String createdByName;
	global Datetime createdDate;
	global Metadata.DeployDetails details;
	global Boolean done;
	global String errorMessage;
	global Metadata.StatusCode errorStatusCode;
	global Id id;
	global Boolean ignoreWarnings;
	global Datetime lastModifiedDate;
	global List<Metadata.DeployMessage> messages;
	global Integer numberComponentErrors;
	global Integer numberComponentsDeployed;
	global Integer numberComponentsTotal;
	global Boolean rollbackOnError;
	global Datetime startDate;
	global String stateDetail;
	global Metadata.DeployStatus status;
	global Boolean success;
	global DeployResult() { }
	global Object clone() { }

}