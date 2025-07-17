global class TaxLineItemRequest {
	global ConnectApi.TaxAddressesRequest addresses;
	global Double amount;
	global String description;
	global Datetime effectiveDate;
	global String legalEntity;
	global String lineNumber;
	global String productCode;
	global String productId;
	global String productSKU;
	global Double quantity;
	global String taxCode;
	global Double unitPrice;
	global TaxLineItemRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}