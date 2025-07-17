global class SingleEmailMessage {
	global List<String> bccaddresses;
	global List<String> ccaddresses;
	global String charset;
	global List<String> entityattachments;
	global List<Messaging.EmailFileAttachment> fileattachments;
	global String htmlbody;
	global String inreplyto;
	global Boolean oneclickpost;
	global String optoutpolicy;
	global Id orgwideemailaddressid;
	global String plaintextbody;
	global String references;
	global Id targetobjectid;
	global Id templateid;
	global String templatename;
	global List<String> toaddresses;
	global Boolean treatbodiesastemplate;
	global Boolean treattargetobjectasrecipient;
	global String unsubscribecomment;
	global List<String> unsubscribeurls;
	global Boolean usermail;
	global Id whatid;
	global SingleEmailMessage() { }
	global Boolean equals(Object obj) { }
	global List<String> getBccAddresses() { }
	global Boolean getBccSender() { }
	global List<String> getCcAddresses() { }
	global String getCharset() { }
	global String getEmailPriority() { }
	global List<String> getEntityAttachments() { }
	global List<Messaging.EmailFileAttachment> getFileAttachments() { }
	global String getHtmlBody() { }
	global String getInReplyTo() { }
	global Boolean getOneClickPost() { }
	global String getOptOutPolicy() { }
	global Id getOrgWideEmailAddressId() { }
	global String getPlainTextBody() { }
	global String getReferences() { }
	global String getReplyTo() { }
	global Boolean getSaveAsActivity() { }
	global String getSenderDisplayName() { }
	global String getSubject() { }
	global Id getTargetObjectId() { }
	global Id getTemplateId() { }
	global String getTemplateName() { }
	global List<String> getToAddresses() { }
	global String getUnsubscribeComment() { }
	global List<String> getUnsubscribeUrls() { }
	global Boolean getUseSignature() { }
	global Id getWhatId() { }
	global Integer hashCode() { }
	global Boolean isTreatBodiesAsTemplate() { }
	global Boolean isTreatTargetObjectAsRecipient() { }
	global Boolean isUserMail() { }
	global void setBccAddresses(List<String> param0) { }
	global void setBccSender(Boolean param0) { }
	global void setCcAddresses(List<String> param0) { }
	global void setCharset(String param0) { }
	global void setEmailPriority(String param0) { }
	global void setEntityAttachments(List<String> param0) { }
	global void setFileAttachments(List<Messaging.EmailFileAttachment> param0) { }
	global void setHtmlBody(String param0) { }
	global void setInReplyTo(String param0) { }
	global void setOneClickPost(Boolean param0) { }
	global void setOptOutPolicy(String param0) { }
	global void setOrgWideEmailAddressId(Id param0) { }
	global void setPlainTextBody(String param0) { }
	global void setReferences(String param0) { }
	global void setReplyTo(String param0) { }
	global void setSaveAsActivity(Boolean param0) { }
	global void setSenderDisplayName(String param0) { }
	global void setSubject(String param0) { }
	global void setTargetObjectId(Id param0) { }
	global void setTemplateId(Id param0) { }
	global void setToAddresses(List<String> param0) { }
	global void setTreatBodiesAsTemplate(Boolean param0) { }
	global void setTreatTargetObjectAsRecipient(Boolean param0) { }
	global void setUnsubscribeComment(String param0) { }
	global void setUnsubscribeUrls(List<String> param0) { }
	global void setUseSignature(Boolean param0) { }
	global void setWhatId(Id param0) { }
	global String toString() { }

}