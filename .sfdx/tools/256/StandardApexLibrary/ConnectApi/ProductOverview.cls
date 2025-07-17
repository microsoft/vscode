global class ProductOverview {
	global ConnectApi.ProductMedia defaultImage;
	global ConnectApi.ErrorResponse error;
	global Map<String,String> fields;
	global String id;
	global List<ConnectApi.ProductMediaGroup> mediaGroups;
	global String name;
	global ConnectApi.PricingResultLineItem prices;
	global ConnectApi.ProductClass productClass;
	global List<ConnectApi.ProductSellingModel> productSellingModels;
	global ConnectApi.PurchaseQuantityRule purchaseQuantityRule;
	global String sku;
	global Boolean success;
	global String urlName;
	global ConnectApi.ProductAttributeSetSummary variationAttributeSet;
	global ConnectApi.ProductVariationInfo variationInfo;
	global ProductOverview() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}