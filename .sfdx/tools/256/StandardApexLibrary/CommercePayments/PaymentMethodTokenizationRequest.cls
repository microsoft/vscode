global class PaymentMethodTokenizationRequest {
	global commercepayments.AddressRequest address;
	global commercepayments.CardPaymentMethodRequest cardPaymentMethod;
	global Boolean savedByMerchant;
	global PaymentMethodTokenizationRequest(String paymentGatewayId) { }
	global PaymentMethodTokenizationRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}