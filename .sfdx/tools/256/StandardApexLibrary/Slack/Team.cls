global class Team {
	global Team() { }
	global Object clone() { }
	global String getAvatarBaseUrl() { }
	global List<String> getDefaultChannels() { }
	global String getDiscoverable() { }
	global String getDomain() { }
	global String getEmailDomain() { }
	global String getEnterpriseDomain() { }
	global String getEnterpriseId() { }
	global String getEnterpriseName() { }
	global Slack.TeamIcon getIcon() { }
	global String getId() { }
	global Boolean getIsVerified() { }
	global String getName() { }
	global String getUrl() { }
	global void setAvatarBaseUrl(String avatarBaseUrl) { }
	global void setDefaultChannels(List<String> defaultChannels) { }
	global void setDiscoverable(String discoverable) { }
	global void setDomain(String domain) { }
	global void setEmailDomain(String emailDomain) { }
	global void setEnterpriseDomain(String enterpriseDomain) { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setEnterpriseName(String enterpriseName) { }
	global void setIcon(Slack.TeamIcon icon) { }
	global void setId(String id) { }
	global void setIsVerified(Boolean isVerified) { }
	global void setName(String name) { }
	global void setUrl(String url) { }
	global String toString() { }
global class Profile {
	global Team.Profile() { }
	global Object clone() { }
	global String getFieldName() { }
	global String getHint() { }
	global String getId() { }
	global String getLabel() { }
	global Slack.Team.ProfileOptions getOptions() { }
	global Integer getOrdering() { }
	global Slack.Team.ProfilePermissions getPermissions() { }
	global List<String> getPossibleValues() { }
	global String getSectionId() { }
	global String getType() { }
	global Boolean isHidden() { }
	global void setFieldName(String fieldName) { }
	global void setHidden(Boolean hidden) { }
	global void setHint(String hintValue) { }
	global void setId(String id) { }
	global void setLabel(String label) { }
	global void setOptions(Slack.Team.ProfileOptions options) { }
	global void setOrdering(Integer ordering) { }
	global void setPermissions(Slack.Team.ProfilePermissions permissions) { }
	global void setPossibleValues(List<String> possibleValues) { }
	global void setSectionId(String sectionId) { }
	global void setType(String type) { }

}
global class ProfileOptions {
	global Team.ProfileOptions() { }
	global Object clone() { }
	global Boolean isScim() { }
	global Boolean isprotected() { }
	global void setScim(Boolean scim) { }
	global void setprotected(Boolean _protected) { }

}
global class ProfilePermissions {
	global Team.ProfilePermissions() { }
	global Object clone() { }
	global List<String> getApi() { }
	global Boolean isScim() { }
	global Boolean isUi() { }
	global void setApi(List<String> api) { }
	global void setScim(Boolean scim) { }
	global void setUi(Boolean ui) { }

}

}