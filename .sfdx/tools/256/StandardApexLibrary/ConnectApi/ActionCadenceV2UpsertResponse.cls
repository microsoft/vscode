global class ActionCadenceV2UpsertResponse {
	global Map<String,List<ConnectApi.ActionCadenceErrorDetail>> cadenceErrors;
	global String cadenceId;
	global Map<String,List<ConnectApi.ActionCadenceRecordError>> cadenceRuleConditionErrors;
	global Map<String,List<ConnectApi.ActionCadenceRecordError>> cadenceRuleErrors;
	global Map<String,List<ConnectApi.ActionCadenceRecordError>> cadenceStepErrors;
	global Boolean isSuccess;
	global ActionCadenceV2UpsertResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}