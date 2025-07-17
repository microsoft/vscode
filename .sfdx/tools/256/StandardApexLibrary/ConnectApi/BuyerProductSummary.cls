global class BuyerProductSummary {
	global Boolean canViewProduct;
	global ConnectApi.ErrorResponse error;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global ConnectApi.ProductMedia image;
	global String name;
	global String sku;
	global Boolean success;
	global List<ConnectApi.ProductAttributeSummary> variationAttributes;
	global BuyerProductSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}