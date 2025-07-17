global class PaymentMethodRequest {
	global commercepayments.AddressRequest address;
	global commercepayments.CardPaymentMethodRequest cardPaymentMethod;
	global String id;
	global PaymentMethodRequest(commercepayments.CardPaymentMethodRequest cardPaymentMethodRequest) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}