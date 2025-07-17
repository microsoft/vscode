global class AbstractCartItem {
	global ConnectApi.BillingFrequency billingFrequency;
	global String cartDeliveryGroupId;
	global String cartId;
	global String cartItemId;
	global Integer childProductCount;
	global List<SObject> customFields;
	global Boolean isShippingChargeNotApplicable;
	global ConnectApi.CartMessagesSummary messagesSummary;
	global String name;
	global String parentCartItemId;
	global ConnectApi.CartItemProduct productDetails;
	global String productId;
	global String productSellingModelId;
	global String promotionDisplayName;
	global String quantity;
	global ConnectApi.SellingModelType sellingModelType;
	global ConnectApi.CartItemSubType subType;
	global Integer subscriptionTerm;
	global ConnectApi.CartItemType type;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}