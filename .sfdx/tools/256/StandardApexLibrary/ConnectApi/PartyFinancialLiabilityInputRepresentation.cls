global class PartyFinancialLiabilityInputRepresentation {
	global String applicantId;
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global Double estimatedMonthlyPayment;
	global Double interestRate;
	global Boolean isReadOnly;
	global Boolean isRepaymentActive;
	global String lender;
	global String liabilityAccountIdentifier;
	global Double outstandingBalance;
	global List<ConnectApi.partyFinancialLiabilityBorrowerInputRepresentation> partyFinancialLiabilityBorrower;
	global String recordTypeId;
	global ConnectApi.RelatedPersonEnum relatedPerson;
	global Double sharePercent;
	global String shareType;
	global String sourceSystemIdentifier;
	global String startDate;
	global String status;
	global String term;
	global String type;
	global String usageType;
	global String verificationStatus;
	global partyFinancialLiabilityInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}