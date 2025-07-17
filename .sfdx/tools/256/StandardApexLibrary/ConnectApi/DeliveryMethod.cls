global class DeliveryMethod {
	global String adjustedShippingFee;
	global String carrier;
	global String classOfService;
	global String currencyIsoCode;
	global Datetime earliestEstimatedDeliveryTime;
	global String id;
	global Datetime latestEstimatedDeliveryTime;
	global String name;
	global Integer processTime;
	global String processTimeUnit;
	global String shippingFee;
	global String totalAdjustmentAmount;
	global Integer transitTimeMax;
	global Integer transitTimeMin;
	global String transitTimeUnit;
	global DeliveryMethod() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}