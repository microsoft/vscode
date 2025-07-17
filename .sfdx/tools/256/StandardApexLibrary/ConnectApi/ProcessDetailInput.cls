global class ProcessDetailInput {
	global String apexClassName;
	global String dataSourceType;
	global String developerName;
	global String displayRecordFieldName;
	global Boolean isRetryAllowedAfterLimit;
	global String label;
	global String linkedVerificationProcessDetailName;
	global Integer optionalVerifierCount;
	global Integer retryLimit;
	global String searchObjectName;
	global String searchResultFilter;
	global String searchResultSortOrder;
	global String searchResultUniqueIdField;
	global Integer searchSequenceNo;
	global String searchType;
	global List<ConnectApi.VerificationProcessFieldInput> verificationProcessFieldList;
	global ProcessDetailInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}