global class ProductOrderingOutputRepresentation {
	global String creationDate;
	global String expectedCompletionDate;
	global List<ConnectApi.ExternalIdOutputRepresentation> externalId;
	global List<ConnectApi.ProductOrderItemOutputRepresentation> productOrderItem;
	global List<ConnectApi.OpenAPIRelatedPartyOutputRepresentation> relatedParty;
	global String state;
	global String type;
	global ProductOrderingOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}