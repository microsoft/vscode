global class DeliveryEstimateOutputRepresentation {
	global ConnectApi.DeliveryEstimationErrorOutputRepresentation error;
	global String location;
	global List<ConnectApi.ProductDeliverEstimationOutputRepresentation> productDeliverEstimations;
	global String shippingCarrierMethodExternalReference;
	global DeliveryEstimateOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}