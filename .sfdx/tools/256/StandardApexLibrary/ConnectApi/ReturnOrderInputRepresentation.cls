global class ReturnOrderInputRepresentation {
	global String orderSummaryId;
	global String returnOrderLifeCycleType;
	global List<ConnectApi.ReturnOrderLineItemInputRepresentation> returnOrderLineItems;
	global String status;
	global ReturnOrderInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}