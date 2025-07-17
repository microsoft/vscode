global class UserProfile {
	global ConnectApi.UserCapabilities capabilities;
	global String id;
	global List<ConnectApi.UserProfileTab> tabs;
	global String url;
	global ConnectApi.UserDetail userDetail;
	global UserProfile() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}