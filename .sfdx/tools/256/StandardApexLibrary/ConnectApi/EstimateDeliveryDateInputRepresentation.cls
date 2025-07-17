global class EstimateDeliveryDateInputRepresentation {
	global ConnectApi.DeliveryAddressInputRepresentation deliveryAddress;
	global List<String> locations;
	global List<ConnectApi.DeliveryEstimationProductInputRepresentation> products;
	global ConnectApi.ShippingCarrierInputRepresentation shippingCarrier;
	global EstimateDeliveryDateInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}