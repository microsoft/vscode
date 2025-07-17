global class Cases {
	global Cases() { }
	global Object clone() { }
	global static String generateThreadingMessageId(Id caseId) { }
	global static Id getCaseIdFromEmailHeaders(List<Messaging.InboundEmail.Header> headers) { }
	global static Id getCaseIdFromEmailThreadId(String emailThreadId) { }
	global static Boolean reparentFeedToCaseId(Id feedItemId, Id currentCaseId, Id correctCaseId) { }

}