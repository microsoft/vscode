global class ProductDetail {
	global Map<String,ConnectApi.ProductAttributeSetInfo> attributeSetInfo;
	global ConnectApi.ProductMedia defaultImage;
	global ConnectApi.ProductEntitlement entitlement;
	global Map<String,String> fields;
	global String id;
	global List<ConnectApi.ProductMediaGroup> mediaGroups;
	global ConnectApi.ProductCategoryPath primaryProductCategoryPath;
	global ConnectApi.ProductClass productClass;
	global List<ConnectApi.ProductSellingModel> productSellingModels;
	global ConnectApi.PurchaseQuantityRule purchaseQuantityRule;
	global String urlName;
	global ConnectApi.ProductAttributeSet variationAttributeSet;
	global ConnectApi.ProductVariationInfo variationInfo;
	global String variationParentId;
	global ProductDetail() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Map<String,ConnectApi.ProductAttributeSetInfo> getAttributeSetInfo() { }
	global Double getBuildVersion() { }
	global ConnectApi.ProductMedia getDefaultImage() { }
	global ConnectApi.ProductEntitlement getEntitlement() { }
	global Map<String,String> getFields() { }
	global String getId() { }
	global List<ConnectApi.ProductMediaGroup> getMediaGroups() { }
	global ConnectApi.ProductCategoryPath getPrimaryProductCategoryPath() { }
	global ConnectApi.ProductClass getProductClass() { }
	global List<ConnectApi.ProductSellingModel> getProductSellingModels() { }
	global ConnectApi.PurchaseQuantityRule getPurchaseQuantityRule() { }
	global String getUrlName() { }
	global ConnectApi.ProductAttributeSet getVariationAttributeSet() { }
	global ConnectApi.ProductVariationInfo getVariationInfo() { }
	global String getVariationParentId() { }
	global Integer hashCode() { }
	global void setAttributeSetInfo(Map<String,ConnectApi.ProductAttributeSetInfo> value) { }
	global void setDefaultImage(ConnectApi.ProductMedia value) { }
	global void setEntitlement(ConnectApi.ProductEntitlement value) { }
	global void setFields(Map<String,String> value) { }
	global void setId(String value) { }
	global void setMediaGroups(List<ConnectApi.ProductMediaGroup> value) { }
	global void setPrimaryProductCategoryPath(ConnectApi.ProductCategoryPath value) { }
	global void setProductClass(ConnectApi.ProductClass value) { }
	global void setProductSellingModels(List<ConnectApi.ProductSellingModel> value) { }
	global void setPurchaseQuantityRule(ConnectApi.PurchaseQuantityRule value) { }
	global void setUrlName(String value) { }
	global void setVariationAttributeSet(ConnectApi.ProductAttributeSet value) { }
	global void setVariationInfo(ConnectApi.ProductVariationInfo value) { }
	global void setVariationParentId(String value) { }
	global String toString() { }

}