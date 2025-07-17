global class PlaceQuoteResponse {
	global String quoteId;
	global String requestIdentifier;
	global List<ConnectApi.PlaceQuoteErrorResponse> responseError;
	global String statusURL;
	global Boolean success;
	global PlaceQuoteResponse() { }
	global Object clone() { }

}