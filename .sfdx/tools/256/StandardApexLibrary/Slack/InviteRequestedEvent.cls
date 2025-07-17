global class InviteRequestedEvent {
	global InviteRequestedEvent() { }
	global Object clone() { }
	global Slack.InviteRequestedEvent.InviteRequest getInviteRequest() { }
	global String getSubtype() { }
	global String getType() { }
	global void setInviteRequest(Slack.InviteRequestedEvent.InviteRequest inviteRequest) { }
	global String toString() { }
global class InviteRequest {
	global InviteRequestedEvent.InviteRequest() { }
	global Object clone() { }
	global List<String> getChannelIds() { }
	global Integer getDateCreated() { }
	global Integer getDateExpire() { }
	global String getEmail() { }
	global String getId() { }
	global String getInviteType() { }
	global String getRealName() { }
	global String getRequestReason() { }
	global List<String> getRequesterIds() { }
	global Slack.InviteRequestedEvent.Team getTeam() { }
	global void setChannelIds(List<String> channelIds) { }
	global void setDateCreated(Integer dateCreated) { }
	global void setDateExpire(Integer dateExpire) { }
	global void setEmail(String email) { }
	global void setId(String id) { }
	global void setInviteType(String inviteType) { }
	global void setRealName(String realName) { }
	global void setRequestReason(String requestReason) { }
	global void setRequesterIds(List<String> requesterIds) { }
	global void setTeam(Slack.InviteRequestedEvent.Team team) { }

}
global class Team {
	global InviteRequestedEvent.Team() { }
	global Object clone() { }
	global String getDomain() { }
	global String getId() { }
	global String getName() { }
	global void setDomain(String domain) { }
	global void setId(String id) { }
	global void setName(String name) { }

}

}