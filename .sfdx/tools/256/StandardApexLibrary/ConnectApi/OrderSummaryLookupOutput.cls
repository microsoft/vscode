global class OrderSummaryLookupOutput {
	global ConnectApi.OrderSummaryAdjustmentAggregates adjustmentAggregates;
	global List<ConnectApi.OrderSummaryAdjustment> adjustments;
	global String currencyIsoCode;
	global List<ConnectApi.OrderDeliveryGroupSummaryLookupOutput> deliveryGroups;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global String orderNumber;
	global ConnectApi.BuyerProfileDetail owner;
	global List<ConnectApi.OrderPayments> payments;
	global String status;
	global OrderSummaryLookupOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}