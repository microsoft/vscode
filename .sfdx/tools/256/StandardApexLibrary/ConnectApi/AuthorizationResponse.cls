global class AuthorizationResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.AuthorizationGatewayResponse gatewayResponse;
	global Boolean isMultiCaptureSupported;
	global ConnectApi.PaymentAuthorizationResponse paymentAuthorization;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentGroupResponse paymentGroup;
	global ConnectApi.PaymentMethodResponse paymentMethod;
	global AuthorizationResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}