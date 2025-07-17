global class Messaging {
	/**
	 * Convert a value containing a raw RFC822 email stream into a new InboundEmail instance. Typically used with message/rfc822 binary attachments.
	 */
	global static Messaging.InboundEmail extractInboundEmail(Object source, Boolean includeForwardedAttachments) { }
	global static List<Messaging.RenderEmailTemplateBodyResult> renderEmailTemplate(String whoId, String whatId, List<String> bodies) { }
	global static Messaging.SingleEmailMessage renderStoredEmailTemplate(String templateId, String whoId, String whatId, Messaging.AttachmentRetrievalOption attachmentRetrievalOption, Boolean updateEmailTemplateUsage) { }
	global static Messaging.SingleEmailMessage renderStoredEmailTemplate(String templateId, String whoId, String whatId, Messaging.AttachmentRetrievalOption attachmentRetrievalOption) { }
	global static Messaging.SingleEmailMessage renderStoredEmailTemplate(String templateId, String whoId, String whatId) { }
	/**
	 * Reserve capacity to send mass emails.
	 */
	global static void reserveMassEmailCapacity(Integer count) { }
	/**
	 * Reserve capacity to send single emails.
	 */
	global static void reserveSingleEmailCapacity(Integer count) { }
	/**
	 * Send email.
	 */
	global static List<Messaging.SendEmailResult> sendEmail(List<Messaging.Email> emailMessages, Boolean allOrNothing) { }
	/**
	 * Send email.
	 */
	global static List<Messaging.SendEmailResult> sendEmail(List<Messaging.Email> emailMessages) { }
	/**
	 * Send EmailMessage.
	 */
	global static List<Messaging.SendEmailResult> sendEmailMessage(List<Id> emailMessagesIds, Boolean allOrNothing) { }
	/**
	 * Send EmailMessage.
	 */
	global static List<Messaging.SendEmailResult> sendEmailMessage(List<Id> emailMessagesIds) { }

}