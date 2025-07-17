global class CartMessage {
	global String message;
	global String messageId;
	global String relatedEntityId;
	global ConnectApi.CartMessageSeverity severity;
	global String type;
	global Boolean visible;
	global CartMessage() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}