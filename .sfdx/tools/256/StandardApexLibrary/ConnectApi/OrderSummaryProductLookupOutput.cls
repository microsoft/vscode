global class OrderSummaryProductLookupOutput {
	global Boolean canViewProduct;
	global String errorCode;
	global String errorMessage;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global ConnectApi.ProductMedia media;
	global Map<String,ConnectApi.OrderSummaryProductAttribute> variationAttributes;
	global OrderSummaryProductLookupOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}