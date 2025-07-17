global class PromotionCartInput {
	global List<ConnectApi.PromotionCartAdjustmentGroupInput> cartAdjustmentGroups;
	global List<ConnectApi.PromotionCartDeliveryGroupInput> cartDeliveryGroups;
	global List<ConnectApi.PromotionCartItemInput> cartItems;
	global String currencyIsoCode;
	global String id;
	global PromotionCartInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}