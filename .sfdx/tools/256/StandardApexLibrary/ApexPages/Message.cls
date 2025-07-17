global class Message {
	global Message(ApexPages.Severity severity, String summary, String detail, String id) { }
	global Message(ApexPages.Severity severity, String summary, String detail) { }
	global Message(ApexPages.Severity severity, String message) { }
	global Boolean equals(Object obj) { }
	/**
	 * Get the message label
	 */
	global String getComponentLabel() { }
	/**
	 * Get the message detail
	 */
	global String getDetail() { }
	/**
	 * Get the message severity
	 */
	global ApexPages.Severity getSeverity() { }
	/**
	 * Get the message summary
	 */
	global String getSummary() { }
	global Integer hashCode() { }
	global String toString() { }

}