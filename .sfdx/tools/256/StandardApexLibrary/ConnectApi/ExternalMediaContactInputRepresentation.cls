global class ExternalMediaContactInputRepresentation {
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> additionalFields;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> attributes;
	global String contactType;
	global String department;
	global String description;
	global String email;
	global String firstName;
	global String id;
	global String lastName;
	global ConnectApi.ExternalMediaAddressInputRepresentation mailingAddress;
	global String phone;
	global String salutation;
	global String tentativeMappingId;
	global String title;
	global ExternalMediaContactInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}