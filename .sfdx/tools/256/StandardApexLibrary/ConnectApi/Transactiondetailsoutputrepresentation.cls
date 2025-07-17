global class TransactionDetailsOutputRepresentation {
	global Datetime activityDate;
	global List<ConnectApi.AdditionalTransactionJournalAttributeOutputRepresentation> additionalTransactionJournalAttributes;
	global String externalTransactionNumber;
	global String journalSubTypeName;
	global String journalTypeName;
	global List<ConnectApi.PointsChangeOutputRepresentation> pointsChange;
	global String productCategoryName;
	global String productName;
	global String transactionAmount;
	global String transactionJournalId;
	global String transactionJournalNumber;
	global TransactionDetailsOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}