global class WaitlistParticipantResult {
	global String createdDate;
	global List<ConnectApi.SchedulerExtendedFieldsOutput> extendedFields;
	global ConnectApi.WaitlistParticipantParticipant participant;
	global String participantIdentifier;
	global String serviceAppointmentId;
	global ConnectApi.WaitlistServiceResource serviceResource;
	global String waitlistParticipantId;
	global ConnectApi.WaitlistWorkTypeGroup workTypeGroup;
	global WaitlistParticipantResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}