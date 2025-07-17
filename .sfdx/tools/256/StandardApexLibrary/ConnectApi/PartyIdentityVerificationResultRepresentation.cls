global class PartyIdentityVerificationResultRepresentation {
	global String createdById;
	global Datetime createdDate;
	global List<ConnectApi.CustomFieldsResultRepresentation> customFields;
	global String id;
	global Boolean isResultOverridden;
	global String lastModifiedById;
	global Datetime lastModifiedDate;
	global String name;
	global String overriddenById;
	global String overriddenResult;
	global String ownerId;
	global List<ConnectApi.PartyIdentityVerificationStepResultRepresentation> partyIdentityVerificationStep;
	global String partyProfileId;
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
	global PartyIdentityVerificationResultRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}