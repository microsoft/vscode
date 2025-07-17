global class TaxTransactionResponse {
	global ConnectApi.TaxAddressesResponse addresses;
	global ConnectApi.TaxAmountDetailsResponse amountDetails;
	global String currencyIsoCode;
	global String description;
	global String documentCode;
	global Datetime effectiveDate;
	global List<ConnectApi.LineItemResponse> lineItems;
	global String referenceDocumentCode;
	global String referenceEntityId;
	global String taxTransactionId;
	global Datetime transactionDate;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}