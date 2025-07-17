global class RecordWithReferenceRequest {
	global placequote.RecordResource record;
	global String referenceId;
	global RecordWithReferenceRequest(String referenceId, placequote.RecordResource record) { }
	global Object clone() { }

}