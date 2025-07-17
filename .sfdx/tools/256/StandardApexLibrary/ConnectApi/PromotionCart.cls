global class PromotionCart {
	global List<ConnectApi.PromotionApproachingDiscount> approachingDiscounts;
	global List<ConnectApi.PromotionBonusProduct> bonusProducts;
	global List<ConnectApi.PromotionCartAdjustmentGroup> cartAdjustmentGroups;
	global List<ConnectApi.PromotionCartDeliveryGroup> cartDeliveryGroups;
	global List<ConnectApi.PromotionCartItem> cartItems;
	global String currencyIsoCode;
	global String id;
	global String totalAdjustmentBaseAmount;
	global String totalNetAmount;
	global String totalProductBaseAmount;
	global PromotionCart() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}