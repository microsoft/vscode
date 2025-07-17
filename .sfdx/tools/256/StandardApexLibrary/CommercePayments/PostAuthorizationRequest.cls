global class PostAuthorizationRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global commercepayments.PostAuthApiPaymentMethodRequest paymentMethod;
	global PostAuthorizationRequest(Double amount) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}