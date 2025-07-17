global class ExternalCredentialInput {
	global ConnectApi.CredentialAuthenticationProtocol authenticationProtocol;
	global ConnectApi.CredentialAuthenticationProtocolVariant authenticationProtocolVariant;
	global List<ConnectApi.CredentialCustomHeaderInput> customHeaders;
	global String developerName;
	global String masterLabel;
	global List<ConnectApi.ExternalCredentialParameterInput> parameters;
	global List<ConnectApi.ExternalCredentialPrincipalInput> principals;
	global ExternalCredentialInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}