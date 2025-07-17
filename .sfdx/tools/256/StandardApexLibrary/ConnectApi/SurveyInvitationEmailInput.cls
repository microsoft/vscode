global class SurveyInvitationEmailInput {
	global Boolean allowGuestUserResponse;
	global Boolean allowParticipantsAccessTheirResponse;
	global List<ConnectApi.AssociateRecordsWithRecipientInput> associateRecordsWithRecipients;
	global String body;
	global Boolean collectAnonymousResponse;
	global String communityId;
	global String emailTemplateId;
	global String fromEmailAddress;
	global Datetime invitationExpirationDate;
	global String invitationOwner;
	global Boolean isPersonalInvitation;
	global List<ConnectApi.RecipientEngagementContextInput> recipientEngagementContexts;
	global List<String> recipients;
	global List<String> shareInvitationsWith;
	global String subject;
	global List<String> surveyQuestionIds;
	global SurveyInvitationEmailInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}