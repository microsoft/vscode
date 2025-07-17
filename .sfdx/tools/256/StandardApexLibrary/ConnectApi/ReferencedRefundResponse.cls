global class ReferencedRefundResponse {
	global ConnectApi.ErrorResponse error;
	global ConnectApi.RefundGatewayResponse gatewayResponse;
	global List<ConnectApi.GatewayLogResponse> paymentGatewayLogs;
	global ConnectApi.PaymentGroupResponse paymentGroup;
	global ConnectApi.RefundResponse refund;
	global ReferencedRefundResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}