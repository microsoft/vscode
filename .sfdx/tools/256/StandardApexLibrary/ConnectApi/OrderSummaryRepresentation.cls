global class OrderSummaryRepresentation {
	global ConnectApi.OrderSummaryAdjustmentAggregates adjustmentAggregates;
	global Datetime createdDate;
	global String currencyIsoCode;
	global Map<String,ConnectApi.RecordField> fields;
	global String orderNumber;
	global Integer orderProductTopLevelLineCount;
	global String orderSummaryId;
	global Datetime orderedDate;
	global String ownerId;
	global List<ConnectApi.OrderSummaryProductLookupOutput> products;
	global String status;
	global String totalAmount;
	global OrderSummaryRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}