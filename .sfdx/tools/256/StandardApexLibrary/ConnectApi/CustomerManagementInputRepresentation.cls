global class CustomerManagementInputRepresentation {
	global List<ConnectApi.RelatedEntityInputRepresentation> account;
	global List<ConnectApi.ContactMediumInputRepresentation> contactMedium;
	global ConnectApi.RelatedEntityInputRepresentation engagedParty;
	global String name;
	global String status;
	global String type;
	global CustomerManagementInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}