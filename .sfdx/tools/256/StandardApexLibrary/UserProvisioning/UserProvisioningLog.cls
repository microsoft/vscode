global class UserProvisioningLog {
	global UserProvisioningLog() { }
	global Object clone() { }
	global static void log(String userProvisioningRequestId, String externalUserId, String externalUserName, String userId, String details) { }
	global static void log(String userProvisioningRequestId, String status, String details) { }
	global static void log(String userProvisioningRequestId, String details) { }

}