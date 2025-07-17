global class ProvisioningProcessHandlerOutput {
	global String UPAStatus;
	global String details;
	global String externalEmail;
	global String externalFirstName;
	global String externalLastName;
	global String externalUserId;
	global String externalUsername;
	global String nextReconOffset;
	global String reconState;
	global String status;
	global ProvisioningProcessHandlerOutput(String status, String details, String externalUserId, String externalUsername, String externalEmail, String externalFirstName, String externalLastName, String UPAStatus, String nextReconOffset) { }
	global ProvisioningProcessHandlerOutput() { }
	global Object clone() { }
	global String getDetails() { }
	global String getExternalEmail() { }
	global String getExternalFirstName() { }
	global String getExternalLastName() { }
	global String getExternalUserId() { }
	global String getExternalUsername() { }
	global String getNextReconOffset() { }
	global String getReconState() { }
	global String getStatus() { }
	global String getUPAStatus() { }
	global void setDetails(String details) { }
	global void setExternalEmail(String externalEmail) { }
	global void setExternalFirstName(String externalFirstName) { }
	global void setExternalLastName(String externalLastName) { }
	global void setExternalUserId(String externalUserId) { }
	global void setExternalUsername(String externalUsername) { }
	global void setNextReconOffset(String nextReconOffset) { }
	global void setReconState(String reconState) { }
	global void setStatus(String status) { }
	global void setUPAStatus(String UPAStatus) { }

}