global class ChatterGroup {
	global String additionalLabel;
	global ConnectApi.Announcement announcement;
	global ConnectApi.BannerPhoto bannerPhoto;
	global Boolean canHaveChatterGuests;
	global ConnectApi.Reference community;
	global String description;
	global String emailToChatterAddress;
	global Boolean isArchived;
	global Boolean isAutoArchiveDisabled;
	global Boolean isBroadcast;
	global Datetime lastFeedElementPostDate;
	global Datetime lastFeedItemPostDate;
	global Integer memberCount;
	global ConnectApi.GroupMembershipType myRole;
	global ConnectApi.UserSummary owner;
	global ConnectApi.Photo photo;
	global ConnectApi.GroupVisibilityType visibility;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}