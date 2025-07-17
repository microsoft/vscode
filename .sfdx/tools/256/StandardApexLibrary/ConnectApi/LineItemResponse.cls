global class LineItemResponse {
	global ConnectApi.TaxAddressesResponse addresses;
	global ConnectApi.TaxAmountDetailsResponse amountDetails;
	global Datetime effectiveDate;
	global String lineNumber;
	global String productCode;
	global Double quantity;
	global String taxCode;
	global List<ConnectApi.TaxDetailsResponse> taxes;
	global LineItemResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}