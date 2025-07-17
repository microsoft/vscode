global class BulkUpdateInput {
	global List<ConnectApi.FieldsToUpdate> fieldsToUpdate;
	global Map<String,ConnectApi.ObjectFilters> filterDetails;
	global Boolean shouldProcessUpdates;
	global BulkUpdateInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}