global class PurchasedProductSummaryOutput {
	global String currencyIsoCode;
	global Map<String,ConnectApi.RecordField> fields;
	global String id;
	global Boolean isAvailable;
	global String listPrice;
	global String name;
	global ConnectApi.CommerceProductSellingModel productSellingModelInformation;
	global ConnectApi.PurchaseQuantityRule purchaseQuantityRule;
	global String salesPrice;
	global String sku;
	global ConnectApi.ProductMedia thumbnailImage;
	global ConnectApi.ProductAttributeSetSummary variationAttributeSet;
	global PurchasedProductSummaryOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}