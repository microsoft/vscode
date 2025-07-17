global class OrderItemSummaryProduct {
	global Boolean canViewProduct;
	global String errorCode;
	global String errorMessage;
	global Map<String,ConnectApi.RecordField> fields;
	global ConnectApi.ProductMedia media;
	global ConnectApi.ProductAttributeSetSummary productAttributes;
	global String productId;
	global OrderItemSummaryProduct() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}