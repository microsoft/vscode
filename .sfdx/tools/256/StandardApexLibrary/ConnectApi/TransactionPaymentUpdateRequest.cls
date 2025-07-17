global class TransactionPaymentUpdateRequest {
	global Double donorCoverAmount;
	global String gatewayReference;
	global Double gatewayTransactionFee;
	global ConnectApi.GiftTransactionLookupDetails giftTransaction;
	global String giftTransactionId;
	global String lastGatewayErrorMessage;
	global String lastGatewayProcessedDateTime;
	global String lastGatewayResponseCode;
	global String processorReference;
	global Double processorTransactionFee;
	global String transactionStatus;
	global TransactionPaymentUpdateRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}