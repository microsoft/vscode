global class CaseParticipantInfoWrapper {
	global Map<String,ConnectApi.GenericObjectWrapper> additionalInfo;
	global String authorizationProof;
	global String participantId;
	global String preferredCallTimeFrom;
	global String preferredCallTimeTo;
	global String preferredCommunicationMode;
	global String role;
	global String status;
	global CaseParticipantInfoWrapper() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}