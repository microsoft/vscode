global class PartyFinancialLiabilityResultRepresentation {
	global String applicantId;
	global String applicationFormId;
	global String createdById;
	global Datetime createdDate;
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsResultRepresentation> customFields;
	global Double estimatedMonthlyPayment;
	global String id;
	global Double interestRate;
	global Boolean isReadOnly;
	global Boolean isRepaymentActive;
	global String lastModifiedById;
	global Datetime lastModifiedDate;
	global String lender;
	global String liabilityAccountIdentifier;
	global String name;
	global Double outstandingBalance;
	global String ownerId;
	global List<ConnectApi.partyFinancialLiabilityBorrowerResultRepresentation> partyFinancialLiabilityBorrower;
	global String partyId;
	global String recordTypeId;
	global Double sharePercent;
	global String shareType;
	global String sourceSystemIdentifier;
	global String startDate;
	global String status;
	global String term;
	global String type;
	global String usageType;
	global String verificationStatus;
	global PartyFinancialLiabilityResultRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}