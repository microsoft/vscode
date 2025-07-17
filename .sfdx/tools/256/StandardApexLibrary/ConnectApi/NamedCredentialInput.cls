global class NamedCredentialInput {
	global ConnectApi.NamedCredentialCalloutOptionsInput calloutOptions;
	global String calloutUrl;
	global List<ConnectApi.CredentialCustomHeaderInput> customHeaders;
	global String description;
	global String developerName;
	global List<ConnectApi.ExternalCredentialInput> externalCredentials;
	global String masterLabel;
	global ConnectApi.NetworkConnectionInput networkConnection;
	global List<ConnectApi.NamedCredentialParameterInput> parameters;
	global ConnectApi.NamedCredentialType type;
	global NamedCredentialInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}