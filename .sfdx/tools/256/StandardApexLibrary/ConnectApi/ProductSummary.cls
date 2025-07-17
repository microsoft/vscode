global class ProductSummary {
	global ConnectApi.ProductMedia defaultImage;
	global Map<String,ConnectApi.FieldValue> fields;
	global String id;
	global String name;
	global ConnectApi.PricingResultLineItem prices;
	global ConnectApi.ProductClass productClass;
	global ConnectApi.CommerceProductSellingModel productSellingModelInformation;
	global ConnectApi.PurchaseQuantityRule purchaseQuantityRule;
	global String urlName;
	global ConnectApi.ProductAttributeSetSummary variationAttributeSet;
	global ProductSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}