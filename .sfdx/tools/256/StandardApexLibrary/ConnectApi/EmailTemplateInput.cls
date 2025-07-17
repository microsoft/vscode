global class EmailTemplateInput {
	global Datetime activatedDate;
	global List<String> attachmentObjectTypes;
	global String automatedEmailActionType;
	global String automatedEmailContextType;
	global String bccEmailIdList;
	global String communicationSubscriptionId;
	global String contentDocumentId;
	global List<ConnectApi.CustomFieldRepresentation> customFields;
	global Datetime deactivatedDate;
	global String description;
	global String emailSubject;
	global String id;
	global Boolean isActive;
	global Boolean isDefaultAutoEmailTemplate;
	global Boolean isSubjectLineEditable;
	global List<String> languages;
	global String name;
	global String productId;
	global String replyToEmailAddress;
	global String replyToType;
	global String senderEmailFieldAPIName;
	global String senderType;
	global Boolean shouldIgnoreEmailConsent;
	global String surveyId;
	global List<String> topics;
	global EmailTemplateInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}