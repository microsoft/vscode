global class VideoCallParticipantResult {
	global String errorMessage;
	global List<ConnectApi.VideoCallParticipant> inCallParticipants;
	global Boolean isSuccess;
	global List<ConnectApi.VideoCallParticipant> waitingParticipants;
	global VideoCallParticipantResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}