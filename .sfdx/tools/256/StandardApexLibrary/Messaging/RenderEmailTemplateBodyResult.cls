global class RenderEmailTemplateBodyResult {
	global List<Messaging.RenderEmailTemplateError> errors;
	global String mergedbody;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global List<Messaging.RenderEmailTemplateError> getErrors() { }
	global String getMergedBody() { }
	global Boolean getSuccess() { }
	global Integer hashCode() { }
	global String toString() { }

}