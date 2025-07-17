global class ProvisioningProcessHandlerInput {
	global String namedCredDevName;
	global String reconFilter;
	global String reconOffset;
	global String userId;
	global String userProvisioningRequestId;
	global ProvisioningProcessHandlerInput(String userProvisioningRequestId, String userId, String namedCredDevName, String reconFilter, String reconOffset) { }
	global Object clone() { }
	global String getNamedCredDevName() { }
	global String getReconFilter() { }
	global String getReconOffset() { }
	global String getUserId() { }
	global String getUserProvisioningRequestId() { }
	global void setNamedCredDevName(String namedCredDevName) { }
	global void setReconFilter(String reconFilter) { }
	global void setReconOffset(String reconOffset) { }
	global void setUserId(String userId) { }
	global void setUserProvisioningRequestId(String userProvisioningRequestId) { }

}