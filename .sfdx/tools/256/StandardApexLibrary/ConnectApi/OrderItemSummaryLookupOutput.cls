global class OrderItemSummaryLookupOutput {
	global ConnectApi.OrderItemSummaryAdjustmentAggregates adjustmentAggregates;
	global List<ConnectApi.OrderSummaryAdjustment> adjustments;
	global List<ConnectApi.OrderItemSummaryLookupOutput> associatedLineItems;
	global String currencyIsoCode;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global ConnectApi.ProductClass itemClass;
	global List<ConnectApi.ProcessExceptionOutput> processExceptions;
	global ConnectApi.OrderSummaryProductLookupOutput product;
	global ConnectApi.ProductSellingModel productSellingModel;
	global OrderItemSummaryLookupOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}