global class RemoteObjectController {
	global RemoteObjectController() { }
	global Object clone() { }
	global static Map<String,Object> create(String type, Map<String,Object> fields) { }
	global static Map<String,Object> del(String type, List<String> ids) { }
	global static Map<String,Object> retrieve(String type, List<String> fields, Map<String,Object> criteria) { }
	global static Map<String,Object> updat(String type, List<String> ids, Map<String,Object> fields) { }

}