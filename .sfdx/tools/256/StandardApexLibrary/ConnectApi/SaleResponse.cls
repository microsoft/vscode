global class SaleResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.SaleGatewayResponse gatewayResponse;
	global ConnectApi.PaymentResponse payment;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentGroupResponse paymentGroup;
	global ConnectApi.PaymentMethodResponse paymentMethod;
	global SaleResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}