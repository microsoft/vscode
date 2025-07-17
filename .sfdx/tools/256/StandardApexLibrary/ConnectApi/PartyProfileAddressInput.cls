global class PartyProfileAddressInput {
	global String addressType;
	global String city;
	global String country;
	global String countryCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global String geocodeAccuracy;
	global Boolean isPrimaryAddress;
	global Double latitude;
	global Double longitude;
	global String name;
	global String postalCode;
	global String recordTypeId;
	global String state;
	global String stateCode;
	global String street;
	global String validityEndDate;
	global String validityStartDate;
	global partyProfileAddressInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}