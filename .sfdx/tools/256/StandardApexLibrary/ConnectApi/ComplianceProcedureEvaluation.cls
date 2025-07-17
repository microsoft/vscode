global class ComplianceProcedureEvaluation {
	global List<ConnectApi.ComplianceControlEvaluation> controls;
	global String errorId;
	global String errorMessage;
	global Boolean isCompliant;
	global ConnectApi.ComplianceProcedureStatus status;
	global String transactionId;
	global String transactionKey;
	global ComplianceProcedureEvaluation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}