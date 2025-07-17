global class PartyFinancialAssetResultRepresentation {
	global String applicantId;
	global String createdById;
	global Datetime createdDate;
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsResultRepresentation> customFields;
	global String description;
	global String id;
	global Boolean isLienExisting;
	global Boolean isReadOnly;
	global String lastModifiedById;
	global Datetime lastModifiedDate;
	global String makeName;
	global String modelName;
	global String modelYear;
	global String name;
	global String ownerId;
	global Double ownershipPercent;
	global Datetime ownershipStartDateTime;
	global String ownershipType;
	global List<ConnectApi.PartyFinancialAssetAdditionalOwnerResultRepresentation> partyFinancialAssetAdditionalOwner;
	global List<ConnectApi.PartyFinancialAssetLienResultRepresentation> partyFinancialAssetLien;
	global String partyId;
	global String partyProfileId;
	global Double payoffDueAmount;
	global Double pledgeAmount;
	global Double purchaseAmount;
	global String recordTypeId;
	global String serialNumber;
	global String sourceSystemIdentifier;
	global String type;
	global String usageType;
	global Double valuationAmount;
	global Datetime valuationDateTime;
	global String verificationStatus;
	global PartyFinancialAssetResultRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}