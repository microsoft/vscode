global class ExternalAuthIdentityProvider {
	global ConnectApi.IdentityProviderAuthFlow authenticationFlow;
	global ConnectApi.IdentityProviderAuthProtocol authenticationProtocol;
	global String authorizeUrl;
	global String callbackUrl;
	global ConnectApi.IdentityProviderClientAuth clientAuthentication;
	global String createdByNamespace;
	global List<ConnectApi.ExternalAuthIdentityProviderCredential> credentials;
	global String description;
	global String fullName;
	global String id;
	global String label;
	global List<ConnectApi.ExternalAuthIdentityProviderParameter> parameters;
	global String standardExternalIdentityProvider;
	global String tokenUrl;
	global String url;
	global String userInfoUrl;
	global ExternalAuthIdentityProvider() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}