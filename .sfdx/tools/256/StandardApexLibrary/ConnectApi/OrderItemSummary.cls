global class OrderItemSummary {
	global ConnectApi.OrderItemSummaryAdjustmentAggregates adjustmentAggregates;
	global String currencyIsoCode;
	global Map<String,ConnectApi.RecordField> fields;
	global String orderItemSummaryId;
	global String orderSummaryId;
	global ConnectApi.OrderItemSummaryProduct product;
	global OrderItemSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}