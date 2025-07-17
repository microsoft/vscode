global class ProductPrice {
	global String currencyIsoCode;
	global String listPrice;
	global String lowestUnitPrice;
	global ConnectApi.PriceAdjustmentSchedule priceAdjustment;
	global String pricebookEntryId;
	global List<ConnectApi.ProductPriceEntry> productPriceEntries;
	global String productSellingModelId;
	global String unitPrice;
	global ProductPrice() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}