global class RecordWithReferenceRequest {
	global commerceorders.RecordResource record;
	global String referenceId;
	global RecordWithReferenceRequest(String referenceId, commerceorders.RecordResource record) { }
	global Object clone() { }

}