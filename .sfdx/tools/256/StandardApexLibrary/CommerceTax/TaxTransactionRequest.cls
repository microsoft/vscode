global class TaxTransactionRequest {
	global commercetax.HeaderTaxAddressesRequest addresses;
	global String currencyIsoCode;
	global commercetax.TaxCustomerDetailsRequest customerDetails;
	global String description;
	global String documentCode;
	global Datetime effectiveDate;
	global List<commercetax.TaxLineItemRequest> lineItems;
	global String referenceDocumentCode;
	global String referenceEntityId;
	global commercetax.TaxSellerDetailsRequest sellerDetails;
	global Datetime transactionDate;
	global TaxTransactionRequest(commercetax.HeaderTaxAddressesRequest addresses, String currencyIsoCode, commercetax.TaxCustomerDetailsRequest customerDetails, String description, String documentCode, String referenceDocumentCode, Datetime transactionDate, Datetime effectiveDate, List<commercetax.TaxLineItemRequest> lineItems, String referenceEntityId, commercetax.TaxSellerDetailsRequest sellerDetails) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}