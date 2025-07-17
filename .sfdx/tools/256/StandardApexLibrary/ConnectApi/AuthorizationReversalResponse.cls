global class AuthorizationReversalResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.AuthReversalGatewayResponse gatewayResponse;
	global ConnectApi.PaymentAuthAdjustmentResponse paymentAuthAdjustment;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global AuthorizationReversalResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}