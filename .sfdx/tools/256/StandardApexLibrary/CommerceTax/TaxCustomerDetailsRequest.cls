global class TaxCustomerDetailsRequest {
	global String accountId;
	global String code;
	global String exemptionNo;
	global String exemptionReason;
	global TaxCustomerDetailsRequest(String accountId, String code, String exemptionNo, String exemptionReason) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}