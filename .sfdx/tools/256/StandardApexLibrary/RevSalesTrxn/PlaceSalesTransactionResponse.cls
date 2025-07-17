global class PlaceSalesTransactionResponse {
	global ConnectApi.ContextDetails contextDetails;
	global List<ConnectApi.PlaceSalesTransactionErrorResponse> errorResponse;
	global Boolean isSuccess;
	global String salesTransactionId;
	global String statusUrl;
	global String trackerId;
	global PlaceSalesTransactionResponse() { }
	global Object clone() { }

}