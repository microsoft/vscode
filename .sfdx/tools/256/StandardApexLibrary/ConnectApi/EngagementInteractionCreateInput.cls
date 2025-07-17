global class EngagementInteractionCreateInput {
	global Boolean attendeeAuthenticated;
	global String attendeeVerificationTime;
	global Boolean attendeeVerified;
	global String communicationChannel;
	global String contextId;
	global List<ConnectApi.EngagementCustomFieldsInput> customFieldsList;
	global String endDateTime;
	global List<ConnectApi.EngagementAttendeeCreateInput> engagementAttendees;
	global List<ConnectApi.EngagementTopicCreateInput> engagementTopics;
	global String externalIdentifierId;
	global String id;
	global String initiatingAttendeeId;
	global String mappedState;
	global String phoneNumber;
	global String reason;
	global String sentiment;
	global String startDateTime;
	global String status;
	global String type;
	global EngagementInteractionCreateInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}