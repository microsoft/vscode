global class GroupMember {
	global String id;
	global Datetime lastFeedAccessDate;
	global ConnectApi.GroupMembershipType role;
	global String url;
	global ConnectApi.UserSummary user;
	global GroupMember() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}