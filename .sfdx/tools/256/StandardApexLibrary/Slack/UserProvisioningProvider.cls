global class UserProvisioningProvider {
	global UserProvisioningProvider() { }
	global Object clone() { }
	global static Slack.UserProvisioningResult importUsers(List<Slack.UserMapping> proposedUserMappings, String installedAppContextId) { }
	global static Slack.UserProvisioningResult revokeUsersBySalesforceId(List<String> salesforceIdsToRevoke, String installedAppContextId) { }
	global static Slack.UserProvisioningResult revokeUsersBySlackId(List<String> slackIdsToRevoke) { }

}