global class DndTeamInfoResponse {
	global DndTeamInfoResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Map<String,Slack.DndTeamInfoResponse.DndTeamMemberInfo> getUsers() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setUsers(Map<String,Slack.DndTeamInfoResponse.DndTeamMemberInfo> users) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class DndTeamMemberInfo {
	global DndTeamInfoResponse.DndTeamMemberInfo() { }
	global Object clone() { }
	global Integer getNextDndEndTs() { }
	global Integer getNextDndStartTs() { }
	global Boolean isDndEnabled() { }
	global void setDndEnabled(Boolean dndEnabled) { }
	global void setNextDndEndTs(Integer nextDndEndTs) { }
	global void setNextDndStartTs(Integer nextDndStartTs) { }

}

}