global class AuthorizationRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global commercepayments.AuthApiPaymentMethodRequest paymentMethod;
	global AuthorizationRequest(Double amount) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}