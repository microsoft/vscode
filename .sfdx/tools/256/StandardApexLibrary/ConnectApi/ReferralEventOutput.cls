global class ReferralEventOutput {
	global List<String> contactIds;
	global List<ConnectApi.ExtendedRewardDetails> extendedRewardList;
	global List<String> referralIds;
	global String referralStage;
	global List<String> transactionJournalIds;
	global String voucherId;
	global List<ConnectApi.VoucherDetails> voucherList;
	global ReferralEventOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}