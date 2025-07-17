global class RecordAlertRepresentation {
	global ConnectApi.RecordAlertActionInfoCollectionRepresentation actions;
	global Boolean active;
	global String description;
	global Datetime effectiveDate;
	global String id;
	global String parentId;
	global String recordAlertCategoryName;
	global String severity;
	global Datetime snoozeUntilDate;
	global ConnectApi.RecordAlertSourceType source;
	global String sourceSystemId;
	global String subject;
	global Datetime validUntilDate;
	global String whatId;
	global RecordAlertRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}