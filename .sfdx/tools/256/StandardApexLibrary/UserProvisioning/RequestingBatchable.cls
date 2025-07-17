global class RequestingBatchable {
	global RequestingBatchable(List<SObject> newRows) { }
	global Object clone() { }
	global void execute(Database.BatchableContext BC, List<UserProvisioningRequest> scope) { }
	global void finish(Database.BatchableContext BC) { }
	global Database.QueryLocator start(Database.BatchableContext BC) { }

}