global class Credential {
	global ConnectApi.CredentialAuthenticationProtocol authenticationProtocol;
	global ConnectApi.CredentialAuthenticationProtocolVariant authenticationProtocolVariant;
	global ConnectApi.CredentialAuthenticationStatus authenticationStatus;
	global Map<String,ConnectApi.CredentialValue> credentials;
	global String externalCredential;
	global String principalName;
	global ConnectApi.CredentialPrincipalType principalType;
	global Credential() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}