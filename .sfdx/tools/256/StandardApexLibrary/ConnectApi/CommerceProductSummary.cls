global class CommerceProductSummary {
	global ConnectApi.CommerceProductSellingModel productSellingModelInformation;
	global ConnectApi.ProductVariationInfo productVariationInfo;
	global ConnectApi.PurchaseQuantityRule purchaseQuantityRule;
	global ConnectApi.CommerceProductAttributeSetSummary variationAttributeSet;
	global CommerceProductSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global ConnectApi.ProductMedia getDefaultImage() { }
	global Map<String,ConnectApi.FieldValue> getFields() { }
	global String getId() { }
	global String getName() { }
	global ConnectApi.ProductClass getProductClass() { }
	global ConnectApi.CommerceProductSellingModel getProductSellingModelInformation() { }
	global ConnectApi.ProductVariationInfo getProductVariationInfo() { }
	global ConnectApi.PurchaseQuantityRule getPurchaseQuantityRule() { }
	global String getUrlName() { }
	global ConnectApi.CommerceProductAttributeSetSummary getVariationAttributeSet() { }
	global Integer hashCode() { }
	global void setDefaultImage(ConnectApi.ProductMedia value) { }
	global void setFields(Map<String,ConnectApi.FieldValue> value) { }
	global void setId(String value) { }
	global void setName(String value) { }
	global void setProductClass(ConnectApi.ProductClass value) { }
	global void setProductSellingModelInformation(ConnectApi.CommerceProductSellingModel value) { }
	global void setProductVariationInfo(ConnectApi.ProductVariationInfo value) { }
	global void setPurchaseQuantityRule(ConnectApi.PurchaseQuantityRule value) { }
	global void setUrlName(String value) { }
	global void setVariationAttributeSet(ConnectApi.CommerceProductAttributeSetSummary value) { }
	global String toString() { }

}