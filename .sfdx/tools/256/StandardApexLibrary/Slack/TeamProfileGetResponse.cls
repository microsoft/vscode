global class TeamProfileGetResponse {
	global TeamProfileGetResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global Slack.TeamProfileGetResponse.Profiles getProfile() { }
	global String getProvided() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProfile(Slack.TeamProfileGetResponse.Profiles profile) { }
	global void setProvided(String provided) { }
	global void setWarning(String warning) { }
	global String toString() { }
global class Profiles {
	global TeamProfileGetResponse.Profiles() { }
	global Object clone() { }
	global List<Slack.TeamProfileGetResponse.Section> getSections() { }
	global void setSections(List<Slack.TeamProfileGetResponse.Section> sections) { }

}
global class Section {
	global TeamProfileGetResponse.Section() { }
	global Object clone() { }
	global String getId() { }
	global String getLabel() { }
	global Integer getOrder() { }
	global String getSectionType() { }
	global String getTeamId() { }
	global Boolean isHidden() { }
	global void setHidden(Boolean hidden) { }
	global void setId(String id) { }
	global void setLabel(String label) { }
	global void setOrder(Integer order) { }
	global void setSectionType(String sectionType) { }
	global void setTeamId(String teamId) { }

}

}