global class MassEmailMessage {
	global String description;
	global List<Id> targetobjectids;
	global Id templateid;
	global List<Id> whatids;
	global MassEmailMessage() { }
	global Boolean equals(Object obj) { }
	global Boolean getBccSender() { }
	global String getDescription() { }
	global String getEmailPriority() { }
	global String getReplyTo() { }
	global Boolean getSaveAsActivity() { }
	global String getSenderDisplayName() { }
	global String getSubject() { }
	global List<Id> getTargetObjectIds() { }
	global Id getTemplateId() { }
	global Boolean getUseSignature() { }
	global List<Id> getWhatIds() { }
	global Integer hashCode() { }
	global void setBccSender(Boolean param0) { }
	global void setDescription(String param0) { }
	global void setEmailPriority(String param0) { }
	global void setReplyTo(String param0) { }
	global void setSaveAsActivity(Boolean param0) { }
	global void setSenderDisplayName(String param0) { }
	global void setSubject(String param0) { }
	global void setTargetObjectIds(List<Id> param0) { }
	global void setTemplateId(Id param0) { }
	global void setUseSignature(Boolean param0) { }
	global void setWhatIds(List<Id> param0) { }
	global String toString() { }

}