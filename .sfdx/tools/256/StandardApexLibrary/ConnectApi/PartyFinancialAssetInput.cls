global class PartyFinancialAssetInput {
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global String description;
	global Boolean isLienExisting;
	global Boolean isReadOnly;
	global String makeName;
	global String modelName;
	global String modelYear;
	global Double ownershipPercent;
	global Datetime ownershipStartDateTime;
	global String ownershipType;
	global List<ConnectApi.partyFinancialAssetAdditionalOwnerInput> partyFinancialAssetAdditionalOwner;
	global List<ConnectApi.partyFinancialAssetLien> partyFinancialAssetLien;
	global Double payoffDueAmount;
	global Double pledgeAmount;
	global Double purchaseAmount;
	global String recordTypeId;
	global ConnectApi.RelatedPersonEnum relatedPerson;
	global String serialNumber;
	global String sourceSystemIdentifier;
	global String type;
	global String usageType;
	global Double valuationAmount;
	global Datetime valuationDateTime;
	global String verificationStatus;
	global partyFinancialAssetInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}