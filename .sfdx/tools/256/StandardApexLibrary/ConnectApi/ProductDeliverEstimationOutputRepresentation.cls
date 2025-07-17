global class ProductDeliverEstimationOutputRepresentation {
	global ConnectApi.DateEstimationOutputRepresentation estimatedDeliveryDate;
	global ConnectApi.DateEstimationOutputRepresentation estimatedShipDate;
	global Double quantity;
	global String routingCalculationType;
	global String stockKeepingUnit;
	global ProductDeliverEstimationOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}