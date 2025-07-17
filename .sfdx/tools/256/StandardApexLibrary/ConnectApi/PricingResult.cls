global class PricingResult {
	global String currencyIsoCode;
	global ConnectApi.ErrorResponse error;
	global List<ConnectApi.PricingResultLineItem> pricingLineItemResults;
	global Boolean success;
	global PricingResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}