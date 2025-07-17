global class PlaceOrderResult {
	global String orderId;
	global String requestIdentifier;
	global List<ConnectApi.PlaceOrderErrorResponse> responseError;
	global String statusURL;
	global Boolean success;
	global PlaceOrderResult() { }
	global Object clone() { }

}