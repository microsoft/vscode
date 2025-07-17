global class PartyIdentityVerificationInput {
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global Boolean isResultOverridden;
	global String name;
	global String overriddenById;
	global String overriddenResult;
	global List<ConnectApi.partyIdentityVerificationStepInput> partyIdentityVerificationStep;
	global String recordTypeId;
	global String reportUrl;
	global Datetime requestCompletionDate;
	global String result;
	global String resultOverrideComment;
	global String resultOverrideReason;
	global String status;
	global String thirdPartyVerfProcIdentifier;
	global String thirdPartyVerfdentifier;
	global String thirdPartyVerificationRunUrl;
	global Datetime verificationRequestDate;
	global String verifiedBy;
	global partyIdentityVerificationInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}