global class QueryProductOfferingOutputRepresentation {
	global ConnectApi.OpenAPICategoryDetailOutputRepresentation category;
	global String creationDate;
	global String effectiveQualificationDate;
	global List<ConnectApi.QualifiedProductOfferingItemOutputRepresentation> qualifiedProductOfferingItem;
	global List<ConnectApi.OpenAPIRelatedPartyOutputRepresentation> relatedParty;
	global String state;
	global String type;
	global QueryProductOfferingOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}