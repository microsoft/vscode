global class AgreementInputRepresentation {
	global List<ConnectApi.AgreementItemInputRepresentation> agreementItem;
	global ConnectApi.TimePeriodInputRepresentation agreementPeriod;
	global ConnectApi.RelatedPartyInputRepresentation agreementSpecification;
	global String agreementTerm;
	global String agreementType;
	global List<ConnectApi.RelatedPartyInputRepresentation> associatedAgreement;
	global String description;
	global List<ConnectApi.RelatedPartyInputRepresentation> engagedParty;
	global String name;
	global AgreementInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}