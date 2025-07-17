global class QuickActionResult {
	global Id contextid;
	global Boolean created;
	global List<Database.Error> errors;
	global List<Id> ids;
	global Boolean success;
	global String successmessage;
	global Boolean equals(Object obj) { }
	global Id getContextId() { }
	global List<Database.Error> getErrors() { }
	global List<Id> getIds() { }
	global String getSuccessMessage() { }
	global Integer hashCode() { }
	global Boolean isCreated() { }
	global Boolean isSuccess() { }
	global String toString() { }

}