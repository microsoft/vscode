global class OrderDeliveryGroupSummaryLookupOutput {
	global String currencyIsoCode;
	global ConnectApi.OrderDeliveryMethodLookupOutput deliveryMethod;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global List<ConnectApi.OrderItemSummaryLookupOutput> lineItems;
	global OrderDeliveryGroupSummaryLookupOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}