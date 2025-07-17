global class UisfUserAuthedEvent {
	global UisfUserAuthedEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global String getSubtype() { }
	global List<Slack.TokenInfo> getTokenScopes() { }
	global String getType() { }
	global String getUser() { }
	global void setEventTs(String eventTs) { }
	global void setTokenScopes(List<Slack.TokenInfo> tokenInfo) { }
	global void setUser(String user) { }

}