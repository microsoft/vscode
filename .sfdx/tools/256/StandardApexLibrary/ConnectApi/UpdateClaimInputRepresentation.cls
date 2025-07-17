global class UpdateClaimInputRepresentation {
	global String accountId;
	global List<ConnectApi.AdditionalFieldInputRep> additionalFields;
	global List<ConnectApi.ClaimAttributeInputRep> attributes;
	global List<ConnectApi.ClaimItemInputRep> claimItems;
	global String claimReason;
	global String claimReasonType;
	global String claimType;
	global String incidentTypeId;
	global String insurancePolicyId;
	global String lossDate;
	global String lossType;
	global String name;
	global List<ConnectApi.ClaimOptionInputRep> options;
	global List<ConnectApi.ClaimParticipantInputRep> participants;
	global UpdateClaimInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}