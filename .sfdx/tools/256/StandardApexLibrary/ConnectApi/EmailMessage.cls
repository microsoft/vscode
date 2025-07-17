global class EmailMessage {
	global ConnectApi.EmailMessageDirection direction;
	global String emailMessageId;
	global String subject;
	global String textBody;
	global List<ConnectApi.EmailAddress> toAddresses;
	global EmailMessage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}