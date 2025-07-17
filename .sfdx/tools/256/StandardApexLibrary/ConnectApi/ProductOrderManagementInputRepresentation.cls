global class ProductOrderManagementInputRepresentation {
	global String completionDate;
	global String creationDate;
	global String description;
	global List<ConnectApi.ExternalIdInputRepresentation> externalId;
	global String priceBookName;
	global List<ConnectApi.ProductOrderItemInputRepresentation> productOrderItem;
	global ConnectApi.QuoteInputRepresentation quote;
	global List<ConnectApi.RelatedPartyOrPartyRoleInputRepresentation> relatedParty;
	global String requestedStartDate;
	global String state;
	global String type;
	global ProductOrderManagementInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}