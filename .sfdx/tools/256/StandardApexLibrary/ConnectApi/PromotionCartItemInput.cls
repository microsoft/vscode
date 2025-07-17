global class PromotionCartItemInput {
	global String cartDeliveryGroupId;
	global String cartId;
	global List<ConnectApi.PromotionCartItemPriceAdjustmentInput> cartItemPriceAdjustments;
	global String id;
	global String itemDescription;
	global String itemName;
	global String listPrice;
	global String product2Id;
	global String productSellingModelId;
	global String quantity;
	global String salesPrice;
	global String sku;
	global ConnectApi.CartItemSubType subType;
	global Integer subscriptionTerm;
	global String totalLineBaseAmount;
	global String totalListBaseAmount;
	global String totalNetAmount;
	global ConnectApi.CartItemType type;
	global PromotionCartItemInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}