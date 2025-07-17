global class FulfillmentGroupInputRepresentation {
	global String fulfilledFromLocationId;
	global String fulfillmentType;
	global List<ConnectApi.OrderItemSummaryInputRepresentation> orderItemSummaries;
	global String referenceId;
	global FulfillmentGroupInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}