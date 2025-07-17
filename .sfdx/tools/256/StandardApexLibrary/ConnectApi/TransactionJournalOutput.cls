global class TransactionJournalOutput {
	global Datetime activityDate;
	global String journalSubType;
	global String journalType;
	global String loyaltyProgram;
	global String loyaltyProgramMember;
	global String referredMember;
	global ConnectApi.JournalStatusResource status;
	global String transactionJournalId;
	global TransactionJournalOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}