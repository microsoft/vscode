global class UserMappingService {
	global UserMappingService() { }
	global Object clone() { }
	global static String getSalesforceUserId(String slackUserId) { }
	global static Map<String,String> getSalesforceUserIdMap(List<String> slackUserIds) { }
	global static String getSlackUserId(String salesforceUserId, String teamId) { }
	global static Map<String,String> getSlackUserIdMap(List<String> salesforceUserIds, String teamId) { }

}