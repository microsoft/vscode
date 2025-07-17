global class ProvisioningBatchable {
	global ProvisioningBatchable(List<SObject> newRows) { }
	global Object clone() { }
	global void execute(Database.BatchableContext BC, List<UserProvisioningRequest> scope) { }
	global void finish(Database.BatchableContext BC) { }
	global Map<String,Object> flowInputPreprocessing(Map<String,Object> myMap) { }
	global void flowPostProcessing(UserProvisioning.ProvisioningProcessHandlerOutput provOutput, SObject thisUPR) { }
	global String getEventPrefix() { }
	global String getFlowName() { }
	global String getFlowNamespace() { }
	global List<SObject> getPerBatchUPL() { }
	global List<UserProvisioningRequest> getPerBatchUPR() { }
	global Map<Id,SObject> getUprToNewUplMap() { }
	global Boolean hasFlow() { }
	global Boolean hasFlowOrApex() { }
	global void postBatchProcessing() { }
	global Database.QueryLocator start(Database.BatchableContext BC) { }

}