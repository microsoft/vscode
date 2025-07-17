global class ExternalCredentialPrincipalInput {
	global String id;
	global List<ConnectApi.ExternalCredentialParameterInput> parameters;
	global String principalName;
	global ConnectApi.CredentialPrincipalType principalType;
	global Integer sequenceNumber;
	global ExternalCredentialPrincipalInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}