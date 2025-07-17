global class ProductDetailsOutputRepresentation {
	global List<ConnectApi.ProductVariationAttributeOutputRepresentation> attributes;
	global List<ConnectApi.ProductBundleChildOutputRepresentation> childItems;
	global String currencyIsoCode;
	global String description;
	global Map<String,Object> fields;
	global List<ConnectApi.ProductImageGroupOutputRepresentation> imageGroups;
	global Double listPrice;
	global String name;
	global String productClass;
	global String productId;
	global ConnectApi.ProductQuantityRuleOutputRepresentation productQuantityRule;
	global String stockKeepingUnit;
	global Integer totalChildrenCount;
	global Double unitPrice;
	global List<ConnectApi.ProductVariantOutputRepresentation> variants;
	global ProductDetailsOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}