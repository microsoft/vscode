global class HeaderTaxAddressesRequest {
	global commercetax.TaxAddressRequest billTo;
	global commercetax.TaxAddressRequest shipFrom;
	global commercetax.TaxAddressRequest shipTo;
	global commercetax.TaxAddressRequest soldTo;
	global commercetax.TaxAddressRequest taxEngineAddress;
	global HeaderTaxAddressesRequest(commercetax.TaxAddressRequest shipFrom, commercetax.TaxAddressRequest shipTo, commercetax.TaxAddressRequest soldTo, commercetax.TaxAddressRequest billTo, commercetax.TaxAddressRequest taxEngineAddress) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}