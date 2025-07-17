global class Security {
	global Security() { }
	global Object clone() { }
	global static System.SObjectAccessDecision stripInaccessible(System.AccessType accessCheckType, List<SObject> sourceRecords, Boolean enforceRootObjectCRUD, Id permissionSetId) { }
	global static System.SObjectAccessDecision stripInaccessible(System.AccessType accessCheckType, List<SObject> sourceRecords, Boolean enforceRootObjectCRUD) { }
	global static System.SObjectAccessDecision stripInaccessible(System.AccessType accessCheckType, List<SObject> sourceRecords) { }

}