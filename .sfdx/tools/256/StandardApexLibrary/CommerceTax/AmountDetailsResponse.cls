global class AmountDetailsResponse {
	global AmountDetailsResponse() { }
	global Object clone() { }
	global java:commerce.tax.impl.engine.integration.response.AmountDetailsEngineResponse getDelegate() { }
	global void setExemptAmount(Double exemptAmount) { }
	global void setTaxAmount(Double taxAmount) { }
	global void setTotalAmount(Double totalAmount) { }
	global void setTotalAmountWithTax(Double totalAmtWithTax) { }

}