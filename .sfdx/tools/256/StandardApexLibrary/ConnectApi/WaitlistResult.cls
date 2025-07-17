global class WaitlistResult {
	global String description;
	global Boolean isActive;
	global String name;
	global List<ConnectApi.WaitlistServiceResource> serviceResources;
	global ConnectApi.WaitlistAnalytics waitlistAnalytics;
	global String waitlistId;
	global List<ConnectApi.WaitlistParticipantResult> waitlistParticipants;
	global List<ConnectApi.WaitlistWorkTypeGroup> workTypeGroups;
	global WaitlistResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}