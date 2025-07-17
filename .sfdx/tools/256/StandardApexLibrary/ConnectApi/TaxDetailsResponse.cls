global class TaxDetailsResponse {
	global Double exemptAmount;
	global String exemptReason;
	global ConnectApi.TaxImpositionResponse imposition;
	global ConnectApi.TaxJurisdictionResponse jurisdiction;
	global Double rate;
	global Double tax;
	global String taxId;
	global Double taxableAmount;
	global TaxDetailsResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}