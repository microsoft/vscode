global class TaxAddressesRequest {
	global ConnectApi.TaxAddressRequest billTo;
	global ConnectApi.TaxAddressRequest shipFrom;
	global ConnectApi.TaxAddressRequest shipTo;
	global ConnectApi.TaxAddressRequest soldTo;
	global TaxAddressesRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}