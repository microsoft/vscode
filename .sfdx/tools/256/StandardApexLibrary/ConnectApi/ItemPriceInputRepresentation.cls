global class ItemPriceInputRepresentation {
	global ConnectApi.itempricePrice price;
	global List<ConnectApi.PriceAlterationInputRepresentation> priceAlteration;
	global String priceType;
	global String recurringChargePeriod;
	global ItemPriceInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}