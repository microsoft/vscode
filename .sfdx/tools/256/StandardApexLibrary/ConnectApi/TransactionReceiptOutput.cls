global class TransactionReceiptOutput {
	global String blockNumber;
	global String cumulativeGasUsed;
	global String gasUsed;
	global String status;
	global String transactionId;
	global List<ConnectApi.WrappedMap> values;
	global TransactionReceiptOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}