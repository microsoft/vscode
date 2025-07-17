global class FulfillmentGroupOutputRepresentation {
	global String fulfilledFromLocationId;
	global String fulfillmentOrderId;
	global String fulfillmentType;
	global String orderDeliveryGroupSummaryId;
	global List<ConnectApi.OrderItemSummaryOutputRepresentation> orderItemSummaries;
	global String orderSummaryId;
	global String referenceId;
	global FulfillmentGroupOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}