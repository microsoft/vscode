global class AddressesResponse {
	global AddressesResponse() { }
	global Object clone() { }
	global java:commerce.tax.impl.engine.integration.response.AddressesEngineResponse getDelegate() { }
	global void setShipFrom(commercetax.AddressResponse shipFrom) { }
	global void setShipTo(commercetax.AddressResponse shipTo) { }
	global void setSoldTo(commercetax.AddressResponse soldTo) { }

}