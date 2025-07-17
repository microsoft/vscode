global class PartyProfileInput {
	global String accountId;
	global String contactId;
	global String countryOfBirth;
	global String countryOfDomicile;
	global Double creditScore;
	global String creditScoreProvider;
	global List<ConnectApi.CustomFieldsInputRepresentation> customFields;
	global String dateOfBirth;
	global String employmentIndustry;
	global String employmentType;
	global String firstName;
	global String fullName;
	global String fundSource;
	global String gender;
	global String householdAccountId;
	global Boolean isNetWorthHigh;
	global Boolean isOffBoarded;
	global String lastName;
	global Datetime lastProfileReviewDate;
	global String leadId;
	global String middleName;
	global String name;
	global String nationality;
	global Datetime nextProfileReviewDate;
	global String offBoardingComments;
	global String offBoardingReason;
	global String orchestrationErrorMessage;
	global String orchestrationId;
	global String orchestrationStatus;
	global List<ConnectApi.partyIdentityVerificationInput> partyIdentityVerification;
	global List<ConnectApi.partyProfileAddressInput> partyProfileAddress;
	global List<ConnectApi.partyProfileRiskInput> partyProfileRisk;
	global String prefix;
	global String primaryEmail;
	global String primaryIdentificationName;
	global String primaryIdentifier;
	global String primaryIdentifierType;
	global String primaryPhone;
	global String recordTypeId;
	global String relatedPartyProfileId;
	global String residentType;
	global String reviewDecision;
	global String stage;
	global String suffix;
	global String surnameAtBirth;
	global String taxPayerIdentificationNumber;
	global String taxPayerIdentificationType;
	global partyProfileInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}