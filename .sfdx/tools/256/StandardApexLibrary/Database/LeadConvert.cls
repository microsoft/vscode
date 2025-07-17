global class LeadConvert {
	global Id accountid;
	global SObject accountrecord;
	global Boolean bypassaccountdedupecheck;
	global Boolean bypasscontactdedupecheck;
	global Id contactid;
	global SObject contactrecord;
	global String convertedstatus;
	global Boolean donotcreateopportunity;
	global Id leadid;
	global Id opportunityid;
	global String opportunityname;
	global SObject opportunityrecord;
	global Boolean overwriteleadsource;
	global Id ownerid;
	global Id relatedpersonaccountid;
	global SObject relatedpersonaccountrecord;
	global Boolean sendnotificationemail;
	global LeadConvert() { }
	global Boolean equals(Object obj) { }
	global Id getAccountId() { }
	global SObject getAccountRecord() { }
	global Boolean getBypassAccountDedupeCheck() { }
	global Boolean getBypassContactDedupeCheck() { }
	global Id getContactId() { }
	global SObject getContactRecord() { }
	global String getConvertedStatus() { }
	global Id getLeadId() { }
	global Id getOpportunityId() { }
	global String getOpportunityName() { }
	global SObject getOpportunityRecord() { }
	global Id getOwnerId() { }
	global Id getRelatedPersonAccountId() { }
	global SObject getRelatedPersonAccountRecord() { }
	global Integer hashCode() { }
	global Boolean isDoNotCreateOpportunity() { }
	global Boolean isOverwriteLeadSource() { }
	global Boolean isSendNotificationEmail() { }
	global void setAccountId(Id param0) { }
	global void setAccountRecord(SObject param0) { }
	global void setBypassAccountDedupeCheck(Boolean param0) { }
	global void setBypassContactDedupeCheck(Boolean param0) { }
	global void setContactId(Id param0) { }
	global void setContactRecord(SObject param0) { }
	global void setConvertedStatus(String param0) { }
	global void setDoNotCreateOpportunity(Boolean param0) { }
	global void setLeadId(Id param0) { }
	global void setOpportunityId(Id param0) { }
	global void setOpportunityName(String param0) { }
	global void setOpportunityRecord(SObject param0) { }
	global void setOverwriteLeadSource(Boolean param0) { }
	global void setOwnerId(Id param0) { }
	global void setRelatedPersonAccountId(Id param0) { }
	global void setRelatedPersonAccountRecord(SObject param0) { }
	global void setSendNotificationEmail(Boolean param0) { }
	global String toString() { }

}