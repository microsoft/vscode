global class TriggerContext {
	global String lastError;
	global Integer retries;
	global Object clone() { }
	global static eventbus.TriggerContext currentContext() { }
	global String getResumeCheckpoint() { }
	global void setResumeCheckpoint(String resumeReplayId) { }

}