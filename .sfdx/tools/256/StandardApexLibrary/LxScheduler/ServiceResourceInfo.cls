global class ServiceResourceInfo {
	global ServiceResourceInfo(String userId, String userName, String email, String serviceResourceId, List<String> territoryIds, String resourceType) { }
	global Object clone() { }
	global String getEmail() { }
	global String getResourceType() { }
	global String getServiceResourceId() { }
	global List<String> getTerritoryIds() { }
	global String getUserId() { }
	global String getUserName() { }

}