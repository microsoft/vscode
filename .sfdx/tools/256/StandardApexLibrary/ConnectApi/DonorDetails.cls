global class DonorDetails {
	global List<ConnectApi.CustomFieldDetails> accountCustomFields;
	global List<ConnectApi.AddressDetails> address;
	global String donorType;
	global String email;
	global ConnectApi.ExternalIdDetails externalId;
	global String firstName;
	global String id;
	global String lastName;
	global String organizationName;
	global String phone;
	global DonorDetails() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}