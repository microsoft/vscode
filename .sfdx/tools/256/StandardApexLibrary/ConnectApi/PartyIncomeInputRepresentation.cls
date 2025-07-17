global class PartyIncomeInputRepresentation {
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global Double incomeAmount;
	global String incomeAsOfDate;
	global String incomeFrequency;
	global String incomeSourceId;
	global String incomeType;
	global Boolean isReadOnly;
	global String recordTypeId;
	global ConnectApi.RelatedPersonEnum relatedPerson;
	global String usageType;
	global String verificationStatus;
	global partyIncomeInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}