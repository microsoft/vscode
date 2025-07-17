global class AbstractTransactionResponse {
	global AbstractTransactionResponse() { }
	global Object clone() { }
	global void setAddresses(commercetax.AddressesResponse addresses) { }
	global void setAmountDetails(commercetax.AmountDetailsResponse amountDetails) { }
	global void setCurrencyIsoCode(String currencyIsoCode) { }
	global void setDescription(String dscptn) { }
	global void setDocumentCode(String documentCode) { }
	global void setEffectiveDate(Datetime effectiveDate) { }
	global void setLineItems(List<commercetax.LineItemResponse> lineItems) { }
	global void setReferenceDocumentCode(String referenceDocumentCode) { }
	global void setReferenceEntityId(String referenceEntityId) { }
	global void setTaxTransactionId(String taxTrxnId) { }
	global void setTransactionDate(Datetime transactionDate) { }

}