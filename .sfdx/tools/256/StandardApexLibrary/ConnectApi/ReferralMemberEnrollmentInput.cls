global class ReferralMemberEnrollmentInput {
	global Map<String,String> additionalMemberFieldValues;
	global Map<String,String> additionalPersonAccountFieldValues;
	global ConnectApi.MemberPersonAccountInput associatedPersonAccountDetails;
	global String contactFieldForLocale;
	global String contactId;
	global String contactLocale;
	global ConnectApi.EnrollmentChannelResource enrollmentChannel;
	global Boolean isAutoEnrolled;
	global Boolean isEnrollmentActive;
	global String memberStatus;
	global Datetime membershipEndDate;
	global String membershipNumber;
	global Boolean optInWhatsApp;
	global Boolean shouldProcessTransactionsInRealTime;
	global ConnectApi.StatementFrequencyResource transactionJournalStatementFrequency;
	global ConnectApi.StatementMethodResource transactionJournalStatementMethod;
	global ReferralMemberEnrollmentInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}