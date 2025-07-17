global class InventoryProductOutputRepresentation {
	global Double availableToFulfill;
	global Double availableToOrder;
	global Double onHand;
	global String product2Id;
	global String stockKeepingUnit;
	global List<ConnectApi.InventoryProductOutputRepresentation> variants;
	global InventoryProductOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}