global class TransactionRequest {
	global String ctxInstanceId;
	global RevSignaling.ProcedurePlan procedurePlanInstance;
	global TransactionRequest(RevSignaling.ProcedurePlan procedurePlan, String ctxInstanceId) { }
	global Object clone() { }

}