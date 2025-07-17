global class UnitOfWork {
	global UnitOfWork() { }
	global Object clone() { }
	global void commitWork() { }
	global Database.DeleteResult deleteRecord(SObject sobj) { }
	global List<Database.DeleteResult> deleteRecords(List<SObject> sObjects) { }
	global void discardWork() { }
	global Database.SaveResult insertRecord(SObject sobj) { }
	global List<Database.SaveResult> insertRecords(List<SObject> sObjects) { }
	global Database.SaveResult updateRecord(SObject sobj) { }
	global List<Database.SaveResult> updateRecords(List<SObject> sObjects) { }
	global Database.UpsertResult upsertRecord(SObject sobj) { }
	global List<Database.UpsertResult> upsertRecords(List<SObject> sObjects) { }

}