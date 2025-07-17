global class PostAuthApiPaymentMethodRequest {
	global commercepayments.AlternativePaymentMethodRequest alternativePaymentMethod;
	global commercepayments.CardPaymentMethodRequest cardPaymentMethod;
	global PostAuthApiPaymentMethodRequest(commercepayments.AlternativePaymentMethodRequest paymentMethodRequest) { }
	global PostAuthApiPaymentMethodRequest(commercepayments.CardPaymentMethodRequest paymentMethodRequest) { }
	global PostAuthApiPaymentMethodRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}