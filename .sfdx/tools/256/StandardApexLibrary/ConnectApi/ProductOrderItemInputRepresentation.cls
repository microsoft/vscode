global class ProductOrderItemInputRepresentation {
	global String action;
	global List<ConnectApi.ItemPriceInputRepresentation> itemPrice;
	global String periodBoundary;
	global Integer periodBoundaryDay;
	global String periodBoundaryStartMonth;
	global ConnectApi.ProductInputRepresentation product;
	global ConnectApi.ProductOfferingInputRepresentation productOffering;
	global List<ConnectApi.ProductOrderItemRelationshipInputRepresentation> productOrderItemRelationship;
	global Integer quantity;
	global ConnectApi.QuoteItemInputRepresentation quoteItem;
	global String type;
	global ProductOrderItemInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}