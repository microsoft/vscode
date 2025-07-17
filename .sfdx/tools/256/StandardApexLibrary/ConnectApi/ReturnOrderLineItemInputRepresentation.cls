global class ReturnOrderLineItemInputRepresentation {
	global Boolean canReduceShipping;
	global String orderItemSummaryId;
	global Double quantityExpected;
	global Double quantityReceived;
	global String reasonForChangeText;
	global String reasonForReturn;
	global List<ConnectApi.ReturnOrderLineItemFeeInputRepresentation> returnOrderLineItemFees;
	global ReturnOrderLineItemInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}