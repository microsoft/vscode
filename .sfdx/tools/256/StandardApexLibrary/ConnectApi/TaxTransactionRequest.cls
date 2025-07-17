global class TaxTransactionRequest {
	global ConnectApi.TaxAddressesRequest addresses;
	global String currencyIsoCode;
	global ConnectApi.TaxCustomerDetailsRequest customerDetails;
	global String description;
	global String documentCode;
	global Datetime effectiveDate;
	global List<ConnectApi.TaxLineItemRequest> lineItems;
	global String referenceDocumentCode;
	global String referenceEntityId;
	global Datetime transactionDate;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}