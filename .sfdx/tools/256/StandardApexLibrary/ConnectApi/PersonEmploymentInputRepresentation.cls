global class PersonEmploymentInputRepresentation {
	global String currencyIsoCode;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global ConnectApi.ApplicationFormAccountAddress employerAddress;
	global String employerPhone;
	global String employmentStatus;
	global String employmentType;
	global String endDate;
	global Double hourlyWage;
	global String name;
	global String occupation;
	global String position;
	global String recordTypeId;
	global ConnectApi.RelatedPersonEnum relatedPerson;
	global String startDate;
	global Integer weeklyHourCount;
	global String workerType;
	global personEmploymentInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}