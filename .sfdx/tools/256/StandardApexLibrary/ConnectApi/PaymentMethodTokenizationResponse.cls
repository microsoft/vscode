global class PaymentMethodTokenizationResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.PaymentMethodTokenizationGatewayResponse gatewayResponse;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentMethodResponse paymentMethod;
	global PaymentMethodTokenizationResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}