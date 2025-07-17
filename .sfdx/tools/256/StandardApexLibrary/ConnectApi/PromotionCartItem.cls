global class PromotionCartItem {
	global String cartDeliveryGroupId;
	global String cartId;
	global List<ConnectApi.PromotionCartItemPriceAdjustment> cartItemPriceAdjustments;
	global String id;
	global String itemDescription;
	global String itemName;
	global String listPrice;
	global String product2Id;
	global String quantity;
	global String salesPrice;
	global String sku;
	global String totalAdjustmentBaseAmount;
	global String totalLineBaseAmount;
	global String totalListBaseAmount;
	global String totalNetAmount;
	global ConnectApi.CartItemType type;
	global PromotionCartItem() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}