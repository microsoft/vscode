global class SendEmailResult {
	global List<Messaging.SendEmailError> errors;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global List<Messaging.SendEmailError> getErrors() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}