global class PluginBatchable {
	global PluginBatchable(List<SObject> newRows) { }
	global Object clone() { }
	global void execute(Database.BatchableContext BC, List<UserProvisioningRequest> scope) { }
	global Map<String,Object> flowInputPreprocessing(Map<String,Object> param0) { }
	global void flowPostProcessing(UserProvisioning.ProvisioningProcessHandlerOutput param0, SObject param1) { }
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