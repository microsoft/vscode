global class TaxDetailsResponse {
	global TaxDetailsResponse() { }
	global Object clone() { }
	global java:commerce.tax.impl.engine.integration.response.TaxDetailsEngineResponse getDelegate() { }
	global void setExemptAmount(Double exemptAmount) { }
	global void setExemptReason(String reason) { }
	global void setImposition(commercetax.ImpositionResponse imposition) { }
	global void setJurisdiction(commercetax.JurisdictionResponse jurisdiction) { }
	global void setRate(Double rate) { }
	global void setSerCode(String serCode) { }
	global void setTax(Double tax) { }
	global void setTaxAuthorityTypeId(String taxAuthorityTypeId) { }
	global void setTaxId(String taxId) { }
	global void setTaxRegionId(String taxRegionId) { }
	global void setTaxRuleDetails(commercetax.RuleDetailsResponse taxRuleDetails) { }
	global void setTaxableAmount(Double taxableAmount) { }

}