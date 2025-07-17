global class OrderShipmentItem {
	global Map<String,ConnectApi.RecordField> fields;
	global String orderItemSummaryId;
	global ConnectApi.OrderItemSummaryProduct product;
	global String productId;
	global Double quantity;
	global String shipmentId;
	global String shipmentItemId;
	global OrderShipmentItem() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}