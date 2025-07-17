global class CustomerManagementOutputRepresentation {
	global List<ConnectApi.OpenAPIAccountOutputRepresentation> account;
	global List<ConnectApi.OpenAPIContractOutputRepresentation> agreement;
	global List<ConnectApi.ContactMediumOutputRepresentation> contactMedium;
	global ConnectApi.OpenAPIAccountContactRelationOutputRepresentation engagedParty;
	global String name;
	global String type;
	global CustomerManagementOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}