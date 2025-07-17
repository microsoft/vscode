global class LineItemResponse {
	global LineItemResponse() { }
	global Object clone() { }
	global java:commerce.tax.impl.engine.integration.response.LineItemEngineResponse getDelegate() { }
	global void setAddresses(commercetax.AddressesResponse addresses) { }
	global void setAmountDetails(commercetax.AmountDetailsResponse amountDetails) { }
	global void setEffectiveDate(Datetime effectiveDate) { }
	global void setIsTaxable(Boolean isTaxable) { }
	global void setLineNumber(String lineNumber) { }
	global void setProductCode(String productCode) { }
	global void setQuantity(Double quantity) { }
	global void setTaxCode(String taxCode) { }
	global void setTaxes(List<commercetax.TaxDetailsResponse> taxes) { }

}