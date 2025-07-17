global class LeadConvertResult {
	global Id accountid;
	global Id contactid;
	global List<Database.Error> errors;
	global Id leadid;
	global Id opportunityid;
	global Id relatedpersonaccountid;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global Id getAccountId() { }
	global Id getContactId() { }
	global List<Database.Error> getErrors() { }
	global Id getLeadId() { }
	global Id getOpportunityId() { }
	global Id getRelatedPersonAccountId() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}