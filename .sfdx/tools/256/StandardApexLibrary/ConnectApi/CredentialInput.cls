global class CredentialInput {
	global ConnectApi.CredentialAuthenticationProtocol authenticationProtocol;
	global ConnectApi.CredentialAuthenticationProtocolVariant authenticationProtocolVariant;
	global Map<String,ConnectApi.CredentialValueInput> credentials;
	global String externalCredential;
	global String principalName;
	global ConnectApi.CredentialPrincipalType principalType;
	global CredentialInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}