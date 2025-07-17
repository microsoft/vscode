global class GetDeletedResult {
	global List<Database.DeletedRecord> deletedrecords;
	global Date earliestdateavailable;
	global Date latestdatecovered;
	global Boolean equals(Object obj) { }
	global List<Database.DeletedRecord> getDeletedRecords() { }
	global Date getEarliestDateAvailable() { }
	global Date getLatestDateCovered() { }
	global Integer hashCode() { }
	global String toString() { }

}