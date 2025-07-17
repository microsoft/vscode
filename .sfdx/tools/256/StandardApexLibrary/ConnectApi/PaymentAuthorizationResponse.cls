global class PaymentAuthorizationResponse {
	global String accountId;
	global Double amount;
	global String currencyIsoCode;
	global Datetime effectiveDate;
	global Datetime expirationDate;
	global String id;
	global String paymentAuthorizationNumber;
	global Datetime requestDate;
	global String status;
	global PaymentAuthorizationResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}