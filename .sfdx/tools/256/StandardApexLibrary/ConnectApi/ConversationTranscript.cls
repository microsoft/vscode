global class ConversationTranscript {
	global List<ConnectApi.ConversationTranscriptEntry> entries;
	global List<ConnectApi.ConversationTranscriptParticipant> participants;
	global String transcribedLanguage;
	global Datetime transcriptionDateTime;
	global ConversationTranscript() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}