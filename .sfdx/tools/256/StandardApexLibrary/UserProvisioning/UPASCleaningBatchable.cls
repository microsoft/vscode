global class UPASCleaningBatchable {
	global UPASCleaningBatchable(String uprId) { }
	global Object clone() { }
	global void execute(Database.BatchableContext BC, List<SObject> scope) { }
	global void finish(Database.BatchableContext BC) { }
	global Database.QueryLocator start(Database.BatchableContext BC) { }

}