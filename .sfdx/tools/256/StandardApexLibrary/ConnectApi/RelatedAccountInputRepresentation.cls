global class RelatedAccountInputRepresentation {
	global String accountCode;
	global String accountId;
	global String accountName;
	global String accountType;
	global ConnectApi.ExternalMediaAddressInputRepresentation address;
	global Map<String,ConnectApi.MediaAccountMapObjectInputRepresentation> attributes;
	global ConnectApi.ExternalMediaAddressInputRepresentation billingAddress;
	global String description;
	global ConnectApi.AccountRelationshipTypeEnum relationshipType;
	global ConnectApi.ExternalMediaAddressInputRepresentation shippingAddress;
	global ConnectApi.ExternalMediaAccountStatusEnum status;
	global String tentativeMappingId;
	global RelatedAccountInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}