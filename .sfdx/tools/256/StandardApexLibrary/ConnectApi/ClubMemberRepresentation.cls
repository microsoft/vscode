global class ClubMemberRepresentation {
	global List<ConnectApi.ClubMemberBenefitsRepresentation> benefits;
	global String clubId;
	global String clubMembershipId;
	global String clubMembershipNumber;
	global String clubName;
	global Datetime membershipEndDate;
	global Datetime membershipStartDate;
	global List<ConnectApi.ClubMemberPromotionsRepresentation> promotions;
	global ClubMemberRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}