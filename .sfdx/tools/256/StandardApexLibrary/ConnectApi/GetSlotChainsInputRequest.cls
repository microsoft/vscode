global class GetSlotChainsInputRequest {
	global Boolean considerPrioritizationRules;
	global String contextId;
	global Boolean formSlotChains;
	global Map<String,Integer> leadTimeMap;
	global List<ConnectApi.SearchConditions> searchConditions;
	global ConnectApi.slotSearchDatesCriteria slotSearchDatesCriteria;
	global Integer threshold;
	global String workProcedureId;
	global GetSlotChainsInputRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}