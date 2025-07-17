global class ClubMemberRenewalInputRepresentation {
	global Datetime clubMembershipEndDate;
	global String clubMembershipNumber;
	global String externalIdentifier;
	global String loyaltyMembershipNumber;
	global String notes;
	global String orderItemId;
	global Integer renewalPeriod;
	global ConnectApi.RenewalPeriodTypeResource renewalPeriodType;
	global ClubMemberRenewalInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}