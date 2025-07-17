global class TransactionLedgersOutputRepresentation {
	global String message;
	global Boolean status;
	global Integer transactionJournalCount;
	global List<ConnectApi.TransactionDetailsOutputRepresentation> transactionJournals;
	global TransactionLedgersOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}