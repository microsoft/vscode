global class ExternalMediaAccountInputRepresentation {
	global String accountId;
	global String accountName;
	global String accountType;
	global String adServerUserId;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> additionalFields;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> attributes;
	global ConnectApi.ExternalMediaAddressInputRepresentation billingAddress;
	global String description;
	global String industry;
	global Integer numberOfEmployees;
	global String parentId;
	global String phone;
	global String rating;
	global ConnectApi.ExternalMediaAddressInputRepresentation shippingAddress;
	global ConnectApi.ExternalMediaAccountStatusEnum status;
	global String website;
	global ExternalMediaAccountInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}