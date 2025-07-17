global class AddItemOutputRepresentation {
	global String id;
	global String name;
	global List<ConnectApi.AddItemAdjustmentOutputRepresentation> orderItemAdjustmentLineSummaries;
	global List<ConnectApi.AddItemTaxOutputRepresentation> orderItemTaxLineItemSummaries;
	global AddItemOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}