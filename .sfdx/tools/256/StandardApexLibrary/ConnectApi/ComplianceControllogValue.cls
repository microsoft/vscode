global class ComplianceControllogValue {
	global Map<String,ConnectApi.ComplianceLoggingBusinessContextEvidenceValue> businessContextAndEvidence;
	global String businessOperationsProcessApiName;
	global String complianceMessage;
	global String controlVersionApiName;
	global String errorId;
	global String errorMessage;
	global Datetime evaluationTime;
	global String inContextOf;
	global Boolean isCompliant;
	global String status;
	global String transactionKey;
	global ComplianceControllogValue() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}