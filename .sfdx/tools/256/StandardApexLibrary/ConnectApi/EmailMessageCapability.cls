global class EmailMessageCapability {
	global List<ConnectApi.EmailAttachment> attachments;
	global ConnectApi.EmailMessageAutomationType automationType;
	global List<ConnectApi.EmailAddress> bccAddresses;
	global String body;
	global List<ConnectApi.EmailAddress> ccAddresses;
	global ConnectApi.EmailMessageDirection direction;
	global String emailMessageId;
	global ConnectApi.EmailAddress fromAddress;
	global Integer htmlExpandEmailThread;
	global Boolean isRichText;
	global ConnectApi.EmailMessageStatus status;
	global String subject;
	global String textBody;
	global List<ConnectApi.EmailAddress> toAddresses;
	global Integer totalAttachments;
	global EmailMessageCapability() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}