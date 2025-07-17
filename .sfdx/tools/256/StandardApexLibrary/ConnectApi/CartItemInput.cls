global class CartItemInput {
	global String cartDeliveryGroupId;
	global List<SObject> customFields;
	global String productId;
	global String productSellingModelId;
	global String quantity;
	global Integer subscriptionTerm;
	global ConnectApi.CartItemType type;
	global CartItemInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global String getCartDeliveryGroupId() { }
	global List<SObject> getCustomFields() { }
	global String getProductId() { }
	global String getProductSellingModelId() { }
	global String getQuantity() { }
	global Integer getSubscriptionTerm() { }
	global ConnectApi.CartItemType getType() { }
	global Integer hashCode() { }
	global void setCartDeliveryGroupId(String value) { }
	global void setCustomFields(List<SObject> value) { }
	global void setProductId(String value) { }
	global void setProductSellingModelId(String value) { }
	global void setQuantity(String value) { }
	global void setSubscriptionTerm(Integer value) { }
	global void setType(ConnectApi.CartItemType value) { }
	global String toString() { }

}