global class ConnectInviteDetail {
	global ConnectInviteDetail() { }
	global Object clone() { }
	global Integer getDateCreated() { }
	global Integer getDateInvalid() { }
	global String getId() { }
	global Slack.ConnectTeam getInvitingTeam() { }
	global Slack.ConnectUser getInvitingUser() { }
	global String getLink() { }
	global String getRecipientEmail() { }
	global String getRecipientUserId() { }
	global void setDateCreated(Integer dateCreated) { }
	global void setDateInvalid(Integer dateInvalid) { }
	global void setId(String id) { }
	global void setInvitingTeam(Slack.ConnectTeam invitingTeam) { }
	global void setInvitingUser(Slack.ConnectUser invitingUser) { }
	global void setLink(String link) { }
	global void setRecipientEmail(String recipientEmail) { }
	global void setRecipientUserId(String recipientUserId) { }
	global String toString() { }

}