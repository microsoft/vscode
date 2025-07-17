global class Event {
	global String action;
	global Map<String,String> data;
	global String entityId;
	global String entityName;
	global String organizationId;
	global String resourceType;
	global Datetime timeStamp;
	global String userId;
	global Event(String organizationId, String userId, String entityName, String action, String resourceType, String entityId, Datetime timeStamp, Map<String,String> data) { }
	global Object clone() { }

}