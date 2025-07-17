global class TransactionDetails {
	global Double amount;
	global Double donorCoverAmount;
	global String gatewayReference;
	global Double gatewayTransactionFee;
	global String lastGatewayErrorMessage;
	global String lastGatewayProcessedDateTime;
	global String lastGatewayResponseCode;
	global String processorReference;
	global Double processorTransactionFee;
	global String receivedDate;
	global String transactionStatus;
	global TransactionDetails() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}