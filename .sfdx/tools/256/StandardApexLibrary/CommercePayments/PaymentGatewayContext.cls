global class PaymentGatewayContext {
	global PaymentGatewayContext(commercepayments.PaymentGatewayRequest request, commercepayments.RequestType requestType) { }
	global Object clone() { }
	global commercepayments.PaymentGatewayRequest getPaymentRequest() { }
	global commercepayments.RequestType getPaymentRequestType() { }

}