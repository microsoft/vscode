global class IdentityVerfFormOutput {
	global String developerName;
	global ConnectApi.IdentityVerfFormDisplayRecord displayRecordDetails;
	global ConnectApi.IdentityVerfFormFieldListOutput formVerificationFieldList;
	global Boolean isVerified;
	global Integer retryCount;
	global String selectedRecordId;
	global ConnectApi.ErrorResponseRepresentation status;
	global IdentityVerfFormOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}