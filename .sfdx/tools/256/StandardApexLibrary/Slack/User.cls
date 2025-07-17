global class User {
	global User() { }
	global Object clone() { }
	global String getColor() { }
	global Slack.User.EnterpriseUser getEnterpriseUser() { }
	global String getId() { }
	global String getLocale() { }
	global String getName() { }
	global String getPresence() { }
	global Slack.User.Profile getProfile() { }
	global String getRealName() { }
	global String getTeamId() { }
	global String getTwoFactorType() { }
	global String getTz() { }
	global String getTzLabel() { }
	global Integer getTzOffset() { }
	global Long getUpdated() { }
	global String getWhoCanShareContactCard() { }
	global Boolean isAdmin() { }
	global Boolean isAppUser() { }
	global Boolean isBot() { }
	global Boolean isDeleted() { }
	global Boolean isEmailConfirmed() { }
	global Boolean isHas2fa() { }
	global Boolean isHasFiles() { }
	global Boolean isInvitedUser() { }
	global Boolean isOwner() { }
	global Boolean isPrimaryOwner() { }
	global Boolean isRestricted() { }
	global Boolean isStranger() { }
	global Boolean isUltraRestricted() { }
	global Boolean isWorkflowBot() { }
	global void setAdmin(Boolean admin) { }
	global void setAppUser(Boolean appUser) { }
	global void setBot(Boolean bot) { }
	global void setColor(String color) { }
	global void setDeleted(Boolean deleted) { }
	global void setEmailConfirmed(Boolean emailConfirmed) { }
	global void setEnterpriseUser(Slack.User.EnterpriseUser enterpriseUser) { }
	global void setHas2fa(Boolean has2fa) { }
	global void setHasFiles(Boolean hasFiles) { }
	global void setId(String id) { }
	global void setInvitedUser(Boolean invitedUser) { }
	global void setLocale(String locale) { }
	global void setName(String name) { }
	global void setOwner(Boolean owner) { }
	global void setPresence(String presence) { }
	global void setPrimaryOwner(Boolean primaryOwner) { }
	global void setProfile(Slack.User.Profile profile) { }
	global void setRealName(String realName) { }
	global void setRestricted(Boolean restricted) { }
	global void setStranger(Boolean stranger) { }
	global void setTeamId(String teamId) { }
	global void setTwoFactorType(String twoFactorType) { }
	global void setTz(String tz) { }
	global void setTzLabel(String tzLabel) { }
	global void setTzOffset(Integer tzOffset) { }
	global void setUltraRestricted(Boolean ultraRestricted) { }
	global void setUpdated(Long updated) { }
	global void setWhoCanShareContactCard(String whoCanShareContactCard) { }
	global void setWorkflowBot(Boolean workflowBot) { }
	global String toString() { }
global class EnterpriseUser {
	global User.EnterpriseUser() { }
	global Object clone() { }
	global String getEnterpriseId() { }
	global String getEnterpriseName() { }
	global String getId() { }
	global List<String> getTeams() { }
	global Boolean isAdmin() { }
	global Boolean isOwner() { }
	global Boolean isPrimaryOwner() { }
	global void setAdmin(Boolean admin) { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setEnterpriseName(String enterpriseName) { }
	global void setId(String id) { }
	global void setOwner(Boolean owner) { }
	global void setPrimaryOwner(Boolean primaryOwner) { }
	global void setTeams(List<String> teams) { }

}
global class Field {
	global User.Field() { }
	global Object clone() { }
	global String getAlt() { }
	global String getLabel() { }
	global String getValue() { }
	global void setAlt(String alt) { }
	global void setLabel(String label) { }
	global void setValue(String value) { }

}
global class Profile {
	global User.Profile() { }
	global Object clone() { }
	global String getApiAppId() { }
	global String getAvatarHash() { }
	global String getBotId() { }
	global String getDisplayName() { }
	global String getDisplayNameNormalized() { }
	global String getEmail() { }
	global Map<String,Slack.User.Field> getFields() { }
	global String getGuestChannels() { }
	global Long getGuestExpirationTs() { }
	global String getGuestInvitedBy() { }
	global String getHuddleState() { }
	global Long getHuddleStateExpirationTs() { }
	global String getImage1024() { }
	global String getImage192() { }
	global String getImage24() { }
	global String getImage32() { }
	global String getImage48() { }
	global String getImage512() { }
	global String getImage72() { }
	global String getImageOriginal() { }
	global String getPhone() { }
	global String getPronouns() { }
	global String getRealName() { }
	global String getRealNameNormalized() { }
	global String getSkype() { }
	global String getStatusEmoji() { }
	global List<Slack.User.StatusEmojiDisplayInfo> getStatusEmojiDisplayInfo() { }
	global String getStatusEmojiUrl() { }
	global Long getStatusExpiration() { }
	global String getStatusText() { }
	global String getStatusTextCanonical() { }
	global String getTeam() { }
	global String getTitle() { }
	global Boolean isAlwaysActive() { }
	global Boolean isCustomImage() { }
	global void setAlwaysActive(Boolean alwaysActive) { }
	global void setApiAppId(String apiAppId) { }
	global void setAvatarHash(String avatarHash) { }
	global void setBotId(String botId) { }
	global void setCustomImage(Boolean customImage) { }
	global void setDisplayName(String displayName) { }
	global void setDisplayNameNormalized(String displayNameNormalized) { }
	global void setEmail(String email) { }
	global void setFields(Map<String,Slack.User.Field> fields) { }
	global void setGuestChannels(String guestChannels) { }
	global void setGuestExpirationTs(Long guestExpirationTs) { }
	global void setGuestInvitedBy(String guestInvitedBy) { }
	global void setHuddleState(String huddleState) { }
	global void setHuddleStateExpirationTs(Long huddleStateExpirationTs) { }
	global void setImage1024(String image1024) { }
	global void setImage192(String image192) { }
	global void setImage24(String image24) { }
	global void setImage32(String image32) { }
	global void setImage48(String image48) { }
	global void setImage512(String image512) { }
	global void setImage72(String image72) { }
	global void setImageOriginal(String imageOriginal) { }
	global void setPhone(String phone) { }
	global void setPronouns(String pronouns) { }
	global void setRealName(String realName) { }
	global void setRealNameNormalized(String realNameNormalized) { }
	global void setSkype(String skype) { }
	global void setStatusEmoji(String statusEmoji) { }
	global void setStatusEmojiDisplayInfo(List<Slack.User.StatusEmojiDisplayInfo> statusEmojiDisplayInfo) { }
	global void setStatusEmojiUrl(String statusEmojiUrl) { }
	global void setStatusExpiration(Long statusExpiration) { }
	global void setStatusText(String statusText) { }
	global void setStatusTextCanonical(String statusTextCanonical) { }
	global void setTeam(String team) { }
	global void setTitle(String title) { }

}
global class StatusEmojiDisplayInfo {
	global User.StatusEmojiDisplayInfo() { }
	global Object clone() { }
	global String getDisplayAlias() { }
	global String getDisplayUrl() { }
	global String getEmojiName() { }
	global String getUnicode() { }
	global void setDisplayAlias(String displayAlias) { }
	global void setDisplayUrl(String displayUrl) { }
	global void setEmojiName(String emojiName) { }
	global void setUnicode(String unicode) { }

}

}