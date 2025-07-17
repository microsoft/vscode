global class TaxLineItemRequest {
	global commercetax.LineTaxAddressesRequest addresses;
	global Double amount;
	global String description;
	global Datetime effectiveDate;
	global String lineNumber;
	global String productCode;
	global String productSKU;
	global Double quantity;
	global String taxCode;
	global TaxLineItemRequest(commercetax.LineTaxAddressesRequest addresses, Double amount, String description, String productCode, Double quantity, String lineNumber, String taxCode, Datetime effectiveDate) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}