global class CPQProductPricesOutputRepresentation {
	global String currencyIsoCode;
	global String effectiveFrom;
	global String effectiveTo;
	global Boolean isDefault;
	global Boolean isDerived;
	global Boolean isSelected;
	global Double price;
	global String priceBookEntryId;
	global String priceBookId;
	global ConnectApi.CPQPricingModelOutputRepresentation pricingModel;
	global CPQProductPricesOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}