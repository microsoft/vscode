global class PartyExpenseInputRepresentation {
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global String expenseAsOfDate;
	global Boolean isReadOnly;
	global String partyFinancialLiabilityId;
	global String recordTypeId;
	global String recurrenceInterval;
	global ConnectApi.RelatedPersonEnum relatedPerson;
	global Double totalAmount;
	global String type;
	global String usageType;
	global String verificationStatus;
	global partyExpenseInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}