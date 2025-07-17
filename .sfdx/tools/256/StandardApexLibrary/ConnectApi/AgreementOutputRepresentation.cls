global class AgreementOutputRepresentation {
	global List<ConnectApi.AgreementItemOutputRepresentation> agreementItem;
	global ConnectApi.AgreementPeriodOutputRepresentation agreementPeriod;
	global ConnectApi.AssociatedAgreementOutputRepresentation agreementSpecification;
	global String agreementType;
	global List<ConnectApi.AssociatedAgreementOutputRepresentation> associatedAgreement;
	global String completionDate;
	global String description;
	global String documentNumber;
	global List<ConnectApi.EngagedPartyOutputRepresentation> engagedParty;
	global String initialDate;
	global String name;
	global String statementOfIntent;
	global String status;
	global String type;
	global AgreementOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}