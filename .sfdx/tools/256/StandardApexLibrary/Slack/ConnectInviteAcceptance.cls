global class ConnectInviteAcceptance {
	global ConnectInviteAcceptance() { }
	global Object clone() { }
	global Slack.ConnectTeam getAcceptingTeam() { }
	global Slack.ConnectUser getAcceptingUser() { }
	global String getApprovalStatus() { }
	global Integer getDateAccepted() { }
	global Integer getDateInvalid() { }
	global Integer getDateLastUpdated() { }
	global List<Slack.ConnectInviteReview> getReviews() { }
	global void setAcceptingTeam(Slack.ConnectTeam acceptingTeam) { }
	global void setAcceptingUser(Slack.ConnectUser acceptingUser) { }
	global void setApprovalStatus(String approvalStatus) { }
	global void setDateAccepted(Integer dateAccepted) { }
	global void setDateInvalid(Integer dateInvalid) { }
	global void setDateLastUpdated(Integer dateLastUpdated) { }
	global void setReviews(List<Slack.ConnectInviteReview> reviews) { }
	global String toString() { }

}