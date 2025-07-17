global class InboundEmail {
	global List<Messaging.InboundEmail.AuthenticationResult> authenticationResults;
	global List<Messaging.InboundEmail.BinaryAttachment> binaryAttachments;
	global List<String> ccAddresses;
	global String fromAddress;
	global String fromName;
	global List<Messaging.InboundEmail.Header> headers;
	global String htmlBody;
	global Boolean htmlBodyIsTruncated;
	global String inReplyTo;
	global String messageId;
	global String plainTextBody;
	global Boolean plainTextBodyIsTruncated;
	global List<String> references;
	global String replyTo;
	global String subject;
	global List<Messaging.InboundEmail.TextAttachment> textAttachments;
	global List<String> toAddresses;
	global InboundEmail() { }
	global Object clone() { }
global class AuthenticationResult {
	global List<Messaging.InboundEmail.AuthenticationResultField> authenticationResultFields;
	global String method;
	global String result;
	global InboundEmail.AuthenticationResult() { }
	global Object clone() { }

}
global class AuthenticationResultField {
	global String name;
	global String value;
	global InboundEmail.AuthenticationResultField() { }
	global Object clone() { }

}
global class BinaryAttachment {
	global Blob body;
	global String fileName;
	global List<Messaging.InboundEmail.Header> headers;
	global String mimeTypeSubType;
	global InboundEmail.BinaryAttachment() { }
	global Object clone() { }

}
global class Header {
	global String name;
	global String value;
	global InboundEmail.Header() { }
	global Object clone() { }

}
global class TextAttachment {
	global String body;
	global Boolean bodyIsTruncated;
	global String charset;
	global String fileName;
	global List<Messaging.InboundEmail.Header> headers;
	global String mimeTypeSubType;
	global InboundEmail.TextAttachment() { }
	global Object clone() { }

}

}