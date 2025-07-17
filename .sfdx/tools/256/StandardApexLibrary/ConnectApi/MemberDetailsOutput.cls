global class MemberDetailsOutput {
	global Map<String,Object> additionalLoyaltyProgramMemberFields;
	global ConnectApi.MemberAccountOutput associatedAccount;
	global ConnectApi.MemberContactOutput associatedContact;
	global Boolean canReceivePartnerPromotions;
	global Boolean canReceivePromotions;
	global String enrollmentChannel;
	global Datetime enrollmentDate;
	global String groupCreatedByMember;
	global String groupName;
	global Datetime lastActivityDate;
	global String loyaltyProgramMemberId;
	global String loyaltyProgramName;
	global List<ConnectApi.MemberCurrencyOutput> memberCurrencies;
	global String memberStatus;
	global List<ConnectApi.MemberTierOutput> memberTiers;
	global String memberType;
	global Datetime membershipEndDate;
	global Datetime membershipLastRenewalDate;
	global String membershipNumber;
	global String referredBy;
	global String relatedCorporateMembershipNumber;
	global String transactionJournalStatementFrequency;
	global Datetime transactionJournalStatementLastGeneratedDate;
	global String transactionJournalStatementMethod;
	global MemberDetailsOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}