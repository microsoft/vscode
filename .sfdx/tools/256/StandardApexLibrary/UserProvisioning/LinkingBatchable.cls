global class LinkingBatchable {
	global LinkingBatchable(String uprId) { }
	global Object clone() { }
	global void execute(Database.BatchableContext BC, List<SObject> scope) { }
	global void finish(Database.BatchableContext BC) { }
	global String getFlowName() { }
	global String getFlowNamespace() { }
	global Boolean hasFlow() { }
	global Boolean hasFlowOrApex() { }
	global Database.QueryLocator start(Database.BatchableContext BC) { }

}