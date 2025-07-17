global class NamedCredential {
	global ConnectApi.NamedCredentialCalloutOptions calloutOptions;
	global ConnectApi.CalloutStatus calloutStatus;
	global String calloutUrl;
	global String createdByNamespace;
	global List<ConnectApi.CredentialCustomHeader> customHeaders;
	global String description;
	global String developerName;
	global List<ConnectApi.ExternalCredential> externalCredentials;
	global String id;
	global String masterLabel;
	global ConnectApi.NetworkConnection networkConnection;
	global List<ConnectApi.NamedCredentialParameter> parameters;
	global ConnectApi.NamedCredentialType type;
	global String url;
	global NamedCredential() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}