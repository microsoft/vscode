global class CreateClaimInputRepresentation {
	global List<ConnectApi.AdditionalFieldInputRep> additionalFields;
	global List<ConnectApi.ClaimAttributeInputRep> attributes;
	global List<ConnectApi.ClaimItemInputRep> claimItems;
	global String claimName;
	global String lossDate;
	global List<ConnectApi.ClaimOptionInputRep> options;
	global List<ConnectApi.ClaimParticipantInputRep> participants;
	global String productCode;
	global CreateClaimInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}