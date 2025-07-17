global class GroupMembershipRequest {
	global Datetime createdDate;
	global String id;
	global Datetime lastUpdateDate;
	global ConnectApi.Reference requestedGroup;
	global String responseMessage;
	global ConnectApi.GroupMembershipRequestStatus status;
	global String url;
	global ConnectApi.UserSummary user;
	global GroupMembershipRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}