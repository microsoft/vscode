global class RecordResource {
	global Map<String,Object> criteria;
	global Map<String,Object> fieldValues;
	global String groupAction;
	global String id;
	global String method;
	global Schema.SObjectType type;
	global RecordResource(Schema.SObjectType type, String method, String groupAction, Map<String,Object> criteria) { }
	global RecordResource(Schema.SObjectType type, String method, Id id) { }
	global RecordResource(Schema.SObjectType type, String method) { }
	global Object clone() { }

}