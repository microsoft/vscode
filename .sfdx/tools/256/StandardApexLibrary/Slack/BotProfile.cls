global class BotProfile {
	global BotProfile() { }
	global Object clone() { }
	global String getAppId() { }
	global Slack.BotProfile.Icons getIcons() { }
	global String getId() { }
	global String getName() { }
	global String getTeamId() { }
	global Integer getUpdated() { }
	global Boolean isDeleted() { }
	global void setAppId(String appId) { }
	global void setDeleted(Boolean deleted) { }
	global void setIcons(Slack.BotProfile.Icons icons) { }
	global void setId(String id) { }
	global void setName(String name) { }
	global void setTeamId(String teamId) { }
	global void setUpdated(Integer updated) { }
	global String toString() { }
global class Icons {
	global BotProfile.Icons() { }
	global Object clone() { }
	global String getImage36() { }
	global String getImage48() { }
	global String getImage72() { }
	global void setImage36(String image36) { }
	global void setImage48(String image48) { }
	global void setImage72(String image72) { }

}

}