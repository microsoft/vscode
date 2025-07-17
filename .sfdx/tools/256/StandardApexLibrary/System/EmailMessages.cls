global class EmailMessages {
	global EmailMessages() { }
	global Object clone() { }
	global static String getFormattedThreadingToken(Id recordId) { }
	global static Id getRecordIdFromEmail(String subject, String textBody, String htmlBody) { }

}