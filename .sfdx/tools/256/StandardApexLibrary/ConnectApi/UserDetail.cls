global class UserDetail {
	global String aboutMe;
	global ConnectApi.Address address;
	global ConnectApi.BannerPhoto bannerPhoto;
	global ConnectApi.ChatterActivity chatterActivity;
	global ConnectApi.GlobalInfluence chatterInfluence;
	global String email;
	global Integer followersCount;
	global ConnectApi.FollowingCounts followingCounts;
	global Integer groupCount;
	global Boolean hasChatter;
	global Boolean isActive;
	global String managerId;
	global String managerName;
	global List<ConnectApi.PhoneNumber> phoneNumbers;
	global Integer thanksReceived;
	global String username;
	global UserDetail() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}