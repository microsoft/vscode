global class ItemPriceOutputRepresentation {
	global ConnectApi.ItempricePriceOutputRepresentation price;
	global List<ConnectApi.PriceAlterationOutputRepresentation> priceAlteration;
	global String priceType;
	global String recurringChargePeriod;
	global String type;
	global ItemPriceOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}