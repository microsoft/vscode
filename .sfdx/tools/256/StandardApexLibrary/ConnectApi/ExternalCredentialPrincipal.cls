global class ExternalCredentialPrincipal {
	global ConnectApi.CredentialAuthenticationStatus authenticationStatus;
	global String id;
	global List<ConnectApi.ExternalCredentialParameter> parameters;
	global List<ConnectApi.ExternalCredentialPrincipalAccess> principalAccess;
	global String principalName;
	global ConnectApi.CredentialPrincipalType principalType;
	global Integer sequenceNumber;
	global ExternalCredentialPrincipal() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}