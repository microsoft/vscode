global class ApplicationFormProductInput {
	global String applicantVisibleStatus;
	global ConnectApi.applicationFormSellerItemInput applicationFormSellerItem;
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global String disbursementMethod;
	global Double downPayment;
	global Boolean hasAutomaticPayment;
	global Boolean hasElectronicStatement;
	global Boolean isAtmCardRequired;
	global Boolean isCheckbookRequired;
	global String loanPurpose;
	global String loanType;
	global String ownershipType;
	global String partnerVisibleStatus;
	global String productId;
	global String recordTypeId;
	global Double requestedAmount;
	global Double requestedMonthlyPayment;
	global Integer requestedTerm;
	global String stage;
	global Double totalBrandOwnedItemAmt;
	global Double totalVendorOwnedItemAmt;
	global applicationFormProductInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}