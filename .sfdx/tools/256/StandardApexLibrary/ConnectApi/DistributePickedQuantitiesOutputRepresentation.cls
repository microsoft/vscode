global class DistributePickedQuantitiesOutputRepresentation {
	global List<ConnectApi.OrderQuantitiesOutputRepresentation> fullyDistributedOrdersList;
	global List<ConnectApi.OrderQuantitiesOutputRepresentation> notDistributedOrdersList;
	global List<ConnectApi.OrderQuantitiesOutputRepresentation> partiallyDistributedOrdersList;
	global List<ConnectApi.ItemQuantityOutputRepresentation> quantitiesRemainingList;
	global DistributePickedQuantitiesOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}