global class CalculateTaxResponse {
	global CalculateTaxResponse() { }
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
	global void setStatus(commercetax.TaxTransactionStatus status) { }
	global void setStatusDescription(String statusDescription) { }
	global void setTaxTransactionId(String taxTrxnId) { }
	global void setTaxTransactionType(commercetax.TaxTransactionType taxTransactionType) { }
	global void setTaxType(commercetax.CalculateTaxType taxType) { }
	global void setTransactionDate(Datetime transactionDate) { }

}