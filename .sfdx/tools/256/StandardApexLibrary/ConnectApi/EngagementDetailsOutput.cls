global class EngagementDetailsOutput {
	global Boolean attendeeAuthenticated;
	global Long attendeeVerificationTime;
	global Boolean attendeeVerified;
	global String communicationChannel;
	global String contextId;
	global String duration;
	global String endDateTime;
	global List<ConnectApi.EngagementAttendeeDetailsOutput> engagementAttendees;
	global List<ConnectApi.EngagementTopicDetailsOutput> engagementTopics;
	global String externalIdentifierId;
	global String id;
	global String initiatingAttendeeId;
	global String mappedState;
	global String ownerId;
	global String sentiment;
	global String startDateTime;
	global String status;
	global String type;
	global EngagementDetailsOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}