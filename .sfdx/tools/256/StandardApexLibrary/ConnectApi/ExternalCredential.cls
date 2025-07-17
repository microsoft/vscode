global class ExternalCredential {
	global ConnectApi.CredentialAuthenticationProtocol authenticationProtocol;
	global ConnectApi.CredentialAuthenticationProtocolVariant authenticationProtocolVariant;
	global ConnectApi.CredentialAuthenticationStatus authenticationStatus;
	global String createdByNamespace;
	global List<ConnectApi.CredentialCustomHeader> customHeaders;
	global String developerName;
	global String id;
	global String masterLabel;
	global List<ConnectApi.ExternalCredentialParameter> parameters;
	global List<ConnectApi.ExternalCredentialPrincipal> principals;
	global List<ConnectApi.NamedCredential> relatedNamedCredentials;
	global String url;
	global ExternalCredential() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}