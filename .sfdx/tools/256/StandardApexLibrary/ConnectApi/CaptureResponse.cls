global class CaptureResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.CaptureGatewayResponse gatewayResponse;
	global ConnectApi.PaymentResponse payment;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentGroupResponse paymentGroup;
	global CaptureResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}