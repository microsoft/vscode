global class ClubMemberEnrollmentInputRepresentation {
	global String accountId;
	global ConnectApi.MemberAccountInput associatedAccountDetails;
	global ConnectApi.MemberContactInput associatedContactDetails;
	global String clubMembershipNumber;
	global String contactId;
	global Datetime enrollmentDate;
	global String loyaltyMembershipNumber;
	global String memberStatus;
	global String membershipBy;
	global Datetime membershipEndDate;
	global ClubMemberEnrollmentInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}