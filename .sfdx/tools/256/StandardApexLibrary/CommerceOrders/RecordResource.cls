global class RecordResource {
	global Map<String,Object> fieldValues;
	global String id;
	global String method;
	global Schema.SObjectType type;
	global RecordResource(Schema.SObjectType type, String method, Id id) { }
	global RecordResource(Schema.SObjectType type, String method) { }
	global Object clone() { }

}