global class RecordWithReferenceRequest {
	global RevSalesTrxn.RecordResource record;
	global String referenceId;
	global RecordWithReferenceRequest(String referenceId, RevSalesTrxn.RecordResource record) { }
	global Object clone() { }

}