global class ClaimOutputRepresentation {
	global Object attributes;
	global String claimId;
	global String claimName;
	global String claimType;
	global Datetime initiationDate;
	global String insurancePolicyId;
	global List<ConnectApi.ClaimItemOutputRepresentation> items;
	global Datetime lossDate;
	global List<ConnectApi.ClaimParticipantOutputRepresentation> participants;
	global String productCode;
	global ClaimOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}