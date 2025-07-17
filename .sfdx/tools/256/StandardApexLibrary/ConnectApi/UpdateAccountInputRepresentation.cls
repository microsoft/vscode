global class UpdateAccountInputRepresentation {
	global String accountId;
	global String accountName;
	global String accountType;
	global String adServerUserId;
	global ConnectApi.ExternalMediaAddressInputRepresentation address;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> attributes;
	global ConnectApi.ExternalMediaAddressInputRepresentation billingAddress;
	global String description;
	global String industry;
	global Integer numberOfEmployees;
	global String parentId;
	global String phone;
	global String rating;
	global List<ConnectApi.RelatedAccountInputRepresentation> relatedAccounts;
	global List<ConnectApi.RelatedContactInputRepresentation> relatedContacts;
	global String requestId;
	global ConnectApi.ExternalMediaAddressInputRepresentation shippingAddress;
	global ConnectApi.ExternalMediaAccountStatusEnum status;
	global String website;
	global UpdateAccountInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}