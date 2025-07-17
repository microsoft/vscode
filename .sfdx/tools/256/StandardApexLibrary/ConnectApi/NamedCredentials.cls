global class NamedCredentials {
	global Object clone() { }
	global static ConnectApi.Credential createCredential(ConnectApi.CredentialInput requestBody, ConnectApi.CreateCredentialAction action) { }
	global static ConnectApi.Credential createCredential(ConnectApi.CredentialInput requestBody) { }
	global static ConnectApi.ExternalAuthIdentityProvider createExternalAuthIdentityProvider(ConnectApi.ExternalAuthIdentityProviderInput requestBody) { }
	global static ConnectApi.ExternalAuthIdentityProviderCredentials createExternalAuthIdentityProviderCredentials(String fullName, ConnectApi.ExternalAuthIdentityProviderCredentialsInput requestBody) { }
	global static ConnectApi.ExternalCredential createExternalCredential(ConnectApi.ExternalCredentialInput requestBody) { }
	global static ConnectApi.NamedCredential createNamedCredential(ConnectApi.NamedCredentialInput requestBody) { }
	global static void deleteCredential(String externalCredential, String principalName, ConnectApi.CredentialPrincipalType principalType, List<String> authenticationParameters) { }
	global static void deleteCredential(String externalCredential, String principalName, ConnectApi.CredentialPrincipalType principalType) { }
	global static ConnectApi.Credential getCredential(String externalCredential, String principalName, ConnectApi.CredentialPrincipalType principalType) { }
	global static ConnectApi.ExternalAuthIdentityProvider getExternalAuthIdentityProvider(String fullName) { }
	global static ConnectApi.ExternalAuthIdentityProviderCredentials getExternalAuthIdentityProviderCredentials(String fullName) { }
	global static ConnectApi.ExternalAuthIdentityProviderList getExternalAuthIdentityProviders() { }
	global static ConnectApi.ExternalCredential getExternalCredential(String developerName) { }
	global static ConnectApi.ExternalCredentialList getExternalCredentials() { }
	global static ConnectApi.NamedCredential getNamedCredential(String developerName) { }
	global static ConnectApi.NamedCredentialList getNamedCredentials() { }
	global static ConnectApi.OAuthCredentialAuthUrl getOAuthCredentialAuthUrl(ConnectApi.OAuthCredentialAuthUrlInput requestBody) { }
	global static ConnectApi.Credential patchCredential(ConnectApi.CredentialInput requestBody) { }
	global static ConnectApi.Credential updateCredential(ConnectApi.CredentialInput requestBody) { }
	global static ConnectApi.ExternalAuthIdentityProviderCredentials updateExternalAuthIdentityProviderCredentials(String fullName, ConnectApi.ExternalAuthIdentityProviderCredentialsInput requestBody) { }

}