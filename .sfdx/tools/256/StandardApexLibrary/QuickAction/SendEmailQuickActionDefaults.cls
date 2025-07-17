global class SendEmailQuickActionDefaults {
	global Object clone() { }
	global String getActionName() { }
	global String getActionType() { }
	global Id getContextId() { }
	global List<String> getFromAddressList() { }
	global Id getInReplyToId() { }
	global SObject getTargetSObject() { }
	global void setIgnoreTemplateSubject(Boolean ignoreSubject) { }
	global void setInsertTemplateBody(Boolean insertBody) { }
	global void setTemplateId(Id templateId) { }

}