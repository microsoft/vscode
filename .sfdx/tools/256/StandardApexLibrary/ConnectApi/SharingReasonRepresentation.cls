global class SharingReasonRepresentation {
	global String accessLevel;
	global String reasonForAccess;
	global String relationship;
	global List<ConnectApi.ShareRelationshipArrayRepresentation> relationshipPaths;
	global ConnectApi.UserOrGroupRepresentation shareRecipient;
	global SharingReasonRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}