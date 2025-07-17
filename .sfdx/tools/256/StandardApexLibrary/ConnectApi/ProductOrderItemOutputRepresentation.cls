global class ProductOrderItemOutputRepresentation {
	global String action;
	global String id;
	global List<ConnectApi.ItemPriceOutputRepresentation> itemPrice;
	global String periodBoundary;
	global Integer periodBoundaryDay;
	global String periodBoundaryStartMonth;
	global ConnectApi.OpenAPIProductDetailsOutputRepresentation product;
	global ConnectApi.ProductOfferingOutputRepresentation productOffering;
	global List<ConnectApi.OrderItemRelationshipOutputRepresentation> productOrderItemRelationship;
	global Integer quantity;
	global String type;
	global ProductOrderItemOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}