global class SObjectAccessDecision {
	global Object clone() { }
	global Set<Integer> getModifiedIndexes() { }
	global List<SObject> getRecords() { }
	global Map<String,Set<String>> getRemovedFields() { }

}