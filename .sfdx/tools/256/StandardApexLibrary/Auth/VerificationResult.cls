global class VerificationResult {
	global String message;
	global System.PageReference redirect;
	global Boolean success;
	global VerificationResult(System.PageReference redirect, Boolean success, String message) { }
	global Object clone() { }

}