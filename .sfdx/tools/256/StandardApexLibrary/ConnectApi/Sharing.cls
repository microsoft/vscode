global class Sharing {
	global Object clone() { }
	global static ConnectApi.RecordAccessDetailRepresentation getRecordAccessDetail(String recordId, String userId, Integer maxReasons, Boolean displayRelationshipPaths) { }
	global static ConnectApi.RecordAccessDetailRepresentation getRecordAccessDetail(String recordId, String userId, Integer maxReasons) { }

}