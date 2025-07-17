global class PromotionDetails {
	global ConnectApi.Coupon coupon;
	global String currencyIsoCode;
	global String description;
	global String displayName;
	global Datetime endDateTime;
	global String id;
	global String imageUrl;
	global Boolean isAutomatic;
	global Boolean isEnrolled;
	global Boolean isEnrollmentRequired;
	global String name;
	global Integer priority;
	global ConnectApi.ProductDetails productDetails;
	global String promotionCode;
	global String promotionPageUrl;
	global Datetime startDateTime;
	global String termsAndCondition;
	global PromotionDetails() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}