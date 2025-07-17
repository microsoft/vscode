global class EngagementInteractionDetailsOutput {
	global Boolean attendeeAuthenticated;
	global String attendeeVerificationTime;
	global Boolean attendeeVerified;
	global String communicationChannel;
	global String contextId;
	global List<ConnectApi.EngagementCustomFieldsOutput> customFields;
	global String duration;
	global String endDateTime;
	global List<ConnectApi.EngagementAttendeeDetailsOutput> engagementAttendees;
	global List<ConnectApi.EngagementTopicOutput> engagementTopics;
	global String externalIdentifierId;
	global String id;
	global String initiatingAttendeeId;
	global String mappedState;
	global String ownerId;
	global String phoneNumber;
	global String reason;
	global String sentiment;
	global String startDateTime;
	global String status;
	global String type;
	global EngagementInteractionDetailsOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}