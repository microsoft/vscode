global class UserProvisioningResult {
	global Object clone() { }
	global List<Slack.UserMappingResult> getFailedMappings() { }
	global List<Slack.UserMappingResult> getSuccessfulMappings() { }
	global Boolean isSuccess() { }
	global String toString() { }

}