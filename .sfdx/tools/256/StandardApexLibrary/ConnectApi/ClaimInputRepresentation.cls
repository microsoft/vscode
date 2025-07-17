global class ClaimInputRepresentation {
	global String accountId;
	global Object additionalFields;
	global List<ConnectApi.AttributeInputRepresentation> attributes;
	global String claimReason;
	global String claimReasonType;
	global String claimType;
	global String incidentTypeId;
	global Datetime initiationDate;
	global String insurancePolicyId;
	global List<ConnectApi.ClaimItemInputRepresentation> items;
	global Datetime lossDate;
	global String lossType;
	global String name;
	global ConnectApi.ClaimOptionsInputRepresentation options;
	global List<ConnectApi.ClaimParticipantInputRepresentation> participants;
	global String productCode;
	global ClaimInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}