global class VerifiedCapability {
	global Boolean isVerifiableByMe;
	global Boolean isVerified;
	global Boolean isVerifiedByAnonymized;
	global ConnectApi.UserSummary lastVerifiedByUser;
	global Datetime lastVerifiedDate;
	global VerifiedCapability() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}