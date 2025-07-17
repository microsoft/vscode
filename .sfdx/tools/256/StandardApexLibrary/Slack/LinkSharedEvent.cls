global class LinkSharedEvent {
	global LinkSharedEvent() { }
	global Object clone() { }
	global String getChannel() { }
	global String getEventTs() { }
	global List<Slack.LinkSharedEvent.Link> getLinks() { }
	global String getMessageTs() { }
	global String getSource() { }
	global String getSubtype() { }
	global String getThreadTs() { }
	global String getType() { }
	global String getUnfurlId() { }
	global String getUser() { }
	global Boolean isBotUserMember() { }
	global void setBotUserMember(Boolean botUserMember) { }
	global void setChannel(String channel) { }
	global void setEventTs(String eventTs) { }
	global void setLinks(List<Slack.LinkSharedEvent.Link> links) { }
	global void setMessageTs(String messageTs) { }
	global void setSource(String source) { }
	global void setThreadTs(String threadTs) { }
	global void setUnfurlId(String unfurlId) { }
	global void setUser(String user) { }
	global String toString() { }
global class Link {
	global LinkSharedEvent.Link() { }
	global Object clone() { }
	global String getDomain() { }
	global String getUrl() { }
	global void setDomain(String domain) { }
	global void setUrl(String url) { }

}

}