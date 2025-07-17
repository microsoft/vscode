global class PostAuthorizationResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.PostAuthGatewayResponse gatewayResponse;
	global ConnectApi.PaymentAuthorizationResponse paymentAuthorization;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentGroupResponse paymentGroup;
	global ConnectApi.PaymentMethodResponse paymentMethod;
	global ConnectApi.PostAuthSPMStatusRepresentation savedPaymentMethodStatus;
	global PostAuthorizationResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}