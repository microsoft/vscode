global class VerificationException extends Exception {
	global VerificationException(Auth.VerificationPolicy policy, String retUrl, String activityDescription) { }
	global VerificationException(Auth.VerificationPolicy policy, String activityDescription) { }
	global Object clone() { }
	global String getActivityDescription() { }
	global Auth.VerificationPolicy getPolicy() { }
	global String getRetUrl() { }
	global String getTypeName() { }

}